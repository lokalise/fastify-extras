import { PromisePool } from '@supercharge/promise-pool'
import type { FastifyBaseLogger } from 'fastify'
import * as prometheus from 'prom-client'

import { ObservableQueue } from './ObservableQueue'
import type { QueueDiscoverer } from './queueDiscoverers'

export type Metrics = {
  countGauge: prometheus.Gauge<'status' | 'queue'>
  processedDuration: prometheus.Histogram<'status' | 'queue'>
  finishedDuration: prometheus.Histogram<'status' | 'queue'>
}

export type MetricCollectorOptions = {
  bullMqPrefix: string
  metricsPrefix: string
  queueDiscoverer: QueueDiscoverer
  excludedQueues: string[]
  histogramBuckets: number[]
}

const getMetrics = (prefix: string, histogramBuckets: number[]): Metrics => ({
  countGauge: new prometheus.Gauge({
    name: `${prefix}_jobs_count`,
    help: 'Total number of jobs',
    labelNames: ['status', 'queue'] as const,
  }),
  processedDuration: new prometheus.Histogram({
    name: `${prefix}_jobs_processed_duration`,
    help: 'Processing time of a jobs (processing until finished)',
    buckets: histogramBuckets,
    labelNames: ['status', 'queue'] as const,
  }),
  finishedDuration: new prometheus.Histogram({
    name: `${prefix}_jobs_finished_duration`,
    help: 'Finish time for jobs (created until finished)',
    buckets: histogramBuckets,
    labelNames: ['status', 'queue'] as const,
  }),
})

export class MetricsCollector {
  private readonly metrics: Metrics
  private observedQueues: ObservableQueue[] | undefined

  constructor(
    private readonly options: MetricCollectorOptions,
    private readonly registry: prometheus.Registry,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.metrics = this.registerMetrics(this.registry, this.options)
  }

  /**
   * Updates metrics for all discovered queues
   */
  async collect() {
    if (!this.observedQueues) {
      this.observedQueues = (await this.options.queueDiscoverer.discoverQueues())
        .filter((queue) => !this.options.excludedQueues.includes(queue.queueName))
        .map(
          (queue) =>
            new ObservableQueue(queue.queueName, queue.redisInstance, this.metrics, this.logger),
        )
    }

    await PromisePool.for(this.observedQueues).process((queue: ObservableQueue) => {
      queue.collect()
    })
  }

  /**
   * Stops the metrics collection and cleans up resources
   */
  async dispose() {
    for (const queue of this.observedQueues ?? []) {
      await queue.dispose()
    }
  }

  private registerMetrics(
    registry: prometheus.Registry,
    { metricsPrefix, histogramBuckets }: MetricCollectorOptions,
  ): Metrics {
    const metrics = getMetrics(metricsPrefix, histogramBuckets)
    const metricNames = Object.keys(metrics)

    // If metrics are already registered, just return them to avoid triggering a Prometheus error
    if (metricNames.length > 0 && registry.getSingleMetric(metricNames[0])) {
      const retrievedMetrics = registry.getMetricsAsArray()
      const returnValue: Record<string, prometheus.MetricObject> = {}

      for (const metric of retrievedMetrics) {
        if (metricNames.includes(metric.name)) {
          returnValue[metric.name as keyof Metrics] = metric
        }
      }

      return returnValue as unknown as Metrics
    }

    for (const metric of Object.values(metrics)) {
      registry.registerMetric(metric)
    }

    return metrics
  }
}
