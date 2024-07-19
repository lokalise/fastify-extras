import type { FastifyBaseLogger } from 'fastify'
import type { Redis } from 'ioredis'
import * as prometheus from 'prom-client'

import { ObservableQueue } from './ObservableQueue'
import type { QueueDiscoverer } from './queueDiscoverers'

export type Metrics = {
  completedGauge: prometheus.Gauge<never>
  activeGauge: prometheus.Gauge<never>
  delayedGauge: prometheus.Gauge<never>
  failedGauge: prometheus.Gauge<never>
  waitingGauge: prometheus.Gauge<never>
  completedDuration: prometheus.Histogram<never>
  processedDuration: prometheus.Histogram<never>
}

export type MetricCollectorOptions = {
  redisClient: Redis
  bullMqPrefix: string
  metricsPrefix: string
  queueDiscoverer: QueueDiscoverer
  excludedQueues: string[]
  histogramBuckets: number[]
}

const getMetrics = (prefix: string, histogramBuckets: number[]): Metrics => ({
  completedGauge: new prometheus.Gauge({
    name: `${prefix}_jobs_completed`,
    help: 'Total number of completed jobs',
    labelNames: ['queue'],
  }),
  activeGauge: new prometheus.Gauge({
    name: `${prefix}_jobs_active`,
    help: 'Total number of active jobs (currently being processed)',
    labelNames: ['queue'],
  }),
  failedGauge: new prometheus.Gauge({
    name: `${prefix}_jobs_failed`,
    help: 'Total number of failed jobs',
    labelNames: ['queue'],
  }),
  delayedGauge: new prometheus.Gauge({
    name: `${prefix}_jobs_delayed`,
    help: 'Total number of jobs that will run in the future',
    labelNames: ['queue'],
  }),
  waitingGauge: new prometheus.Gauge({
    name: `${prefix}_jobs_waiting`,
    help: 'Total number of jobs waiting to be processed',
    labelNames: ['queue'],
  }),
  processedDuration: new prometheus.Histogram({
    name: `${prefix}_jobs_processed_duration`,
    help: 'Processing time for completed jobs (processing until completed)',
    buckets: histogramBuckets,
    labelNames: ['queue'],
  }),
  completedDuration: new prometheus.Histogram({
    name: `${prefix}_jobs_completed_duration`,
    help: 'Completion time for jobs (created until completed)',
    buckets: histogramBuckets,
    labelNames: ['queue'],
  }),
})

export class MetricsCollector {
  private readonly redis: Redis
  private readonly metrics: Metrics
  private observedQueues: ObservableQueue[] | undefined

  constructor(
    private readonly options: MetricCollectorOptions,
    private readonly registry: prometheus.Registry,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.redis = options.redisClient
    this.metrics = this.registerMetrics(this.registry, this.options)
  }

  /**
   * Updates metrics for all discovered queues
   */
  async collect() {
    if (!this.observedQueues) {
      this.observedQueues = (await this.options.queueDiscoverer.discoverQueues())
        .filter((name) => !this.options.excludedQueues.includes(name))
        .map((name) => new ObservableQueue(name, this.redis, this.metrics, this.logger))
    }

    await Promise.all(this.observedQueues.map((queue) => queue.collect()))
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
