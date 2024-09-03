import type { Counter } from "prom-client";
import type { TransactionObservabilityManager } from "@lokalise/node-core";
import type { IFastifyMetrics } from "fastify-metrics";

/**
 * TransactionObservabilityManager implementation that uses Prometheus counter
 * to track the number of started, failed and success transactions.
 */
export class PrometheusCounterTransactionManager implements TransactionObservabilityManager {
  private readonly metricName: string
  private readonly metricDescription: string
  private readonly counter?: Counter<'status' | 'transactionName'>;

  private readonly transactionNameById: Map<string, string> = new Map()

  constructor(
    metricName: string,
    metricDescription:  string,
    appMetrics?: IFastifyMetrics,
  ) {
    this.metricName = metricName
    this.metricDescription = metricDescription
    this.counter = this.registerMetric(appMetrics)
  }

  start(transactionName: string, uniqueTransactionKey: string): void {
    this.transactionNameById.set(uniqueTransactionKey, transactionName)
    this.counter?.inc({ status: 'started', transactionName: transactionName })
  }

  startWithGroup(transactionName: string, uniqueTransactionKey: string, _transactionGroup: string): void {
    this.transactionNameById.set(uniqueTransactionKey, transactionName)
    this.counter?.inc({ status: 'started', transactionName })
  }

  stop(uniqueTransactionKey: string, wasSuccessful = true): void {
    const transactionName = this.transactionNameById.get(uniqueTransactionKey)
    if (!transactionName) return

    this.counter?.inc({ status: wasSuccessful ? 'success' : 'failed', transactionName })
    this.transactionNameById.delete(uniqueTransactionKey)
  }

  private registerMetric(appMetrics?: IFastifyMetrics) {
    if (!appMetrics) return

    const existingMetric: Counter| undefined =
      appMetrics.client.register.getSingleMetric(this.metricName) as Counter | undefined

    if (existingMetric) return existingMetric

    return new appMetrics.client.Counter({
      name: this.metricName,
      help: this.metricDescription,
      labelNames: ['status', 'transactionName'],
    })
  }
}
