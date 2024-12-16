import type { TransactionObservabilityManager } from '@lokalise/node-core'
import type { IFastifyMetrics } from 'fastify-metrics'
import type { Counter } from 'prom-client'

/**
 * TransactionObservabilityManager implementation that uses Prometheus counter
 * to track the number of started, failed and success transactions.
 */
export class PrometheusCounterTransactionManager<CustomLabels extends string = never>
  implements TransactionObservabilityManager
{
  private readonly metricName: string
  private readonly metricDescription: string
  private readonly supportedCustomLabels: Set<string>
  private readonly counter?: Counter<'status' | 'transactionName'>

  private readonly transactionNameByKey: Map<string, string> = new Map()
  private readonly customLabelsByKey: Map<string, Record<CustomLabels, string>> = new Map()

  constructor(
    metricName: string,
    metricDescription: string,
    appMetrics?: IFastifyMetrics,
    customLabels?: Array<CustomLabels>,
  ) {
    this.metricName = metricName
    this.metricDescription = metricDescription
    this.supportedCustomLabels = new Set(customLabels) ?? new Set()
    this.counter = this.registerMetric(appMetrics, customLabels)
  }

  start(transactionName: string, uniqueTransactionKey: string): void {
    this.transactionNameByKey.set(uniqueTransactionKey, transactionName)
    this.counter?.inc({ status: 'started', transactionName: transactionName })
  }

  startWithGroup(
    transactionName: string,
    uniqueTransactionKey: string,
    _transactionGroup: string,
  ): void {
    this.transactionNameByKey.set(uniqueTransactionKey, transactionName)
    this.counter?.inc({ status: 'started', transactionName })
  }

  stop(uniqueTransactionKey: string, wasSuccessful = true): void {
    const transactionName = this.transactionNameByKey.get(uniqueTransactionKey)
    if (!transactionName) return

    const labels: Record<'status' | 'transactionName', string> = {
      status: wasSuccessful ? 'success' : 'failed',
      transactionName,
    }
    let labelsWithCustom: Record<'status' | 'transactionName' | CustomLabels, string> | undefined
    if (this.customLabelsByKey.has(uniqueTransactionKey)) {
      const customLabels = this.customLabelsByKey.get(uniqueTransactionKey)
      labelsWithCustom = {
        ...labels,
        // biome-ignore lint/style/noNonNullAssertion: we already checked the presence
        ...customLabels!,
      }
    }

    this.counter?.inc(labelsWithCustom ?? labels)
    this.transactionNameByKey.delete(uniqueTransactionKey)
    this.customLabelsByKey.delete(uniqueTransactionKey)
  }

  /**
   * Prometheus labels are the way Prometheus handles custom attributes
   * Note that it will skip any attributes that were not included in the constructor param "customLabels"
   */
  addCustomAttributes(
    uniqueTransactionKey: string,
    atts: { [p: string]: string | number | boolean },
  ): void {
    const transactionName = this.transactionNameByKey.get(uniqueTransactionKey)
    if (!transactionName) return

    const supportedLabels = Object.entries(atts).reduce(
      (acc, [key, value]) => {
        if (this.supportedCustomLabels.has(key)) {
          acc[key as CustomLabels] = value as string
        }
        return acc
      },
      {} as Record<CustomLabels, string>,
    )

    this.customLabelsByKey.set(uniqueTransactionKey, supportedLabels)
  }

  private registerMetric(appMetrics?: IFastifyMetrics, customLabels: string[] = []) {
    if (!appMetrics) return

    const existingMetric: Counter | undefined = appMetrics.client.register.getSingleMetric(
      this.metricName,
    ) as Counter | undefined

    if (existingMetric) return existingMetric

    return new appMetrics.client.Counter({
      name: this.metricName,
      help: this.metricDescription,
      labelNames: ['status', 'transactionName', ...customLabels],
    })
  }
}
