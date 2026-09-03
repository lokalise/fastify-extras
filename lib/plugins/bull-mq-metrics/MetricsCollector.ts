import * as prometheus from '@prometheus-io/client'
import { PromisePool } from '@supercharge/promise-pool'
import type { FastifyBaseLogger } from 'fastify'

import { ObservableQueue } from './ObservableQueue.js'
import type { QueueDiscoverer } from './queueDiscoverers.js'

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

const getMetricNames = (prefix: string) =>
  ({
    countGauge: `${prefix}_jobs_count`,
    processedDuration: `${prefix}_jobs_processed_duration`,
    finishedDuration: `${prefix}_jobs_finished_duration`,
  }) satisfies Record<keyof Metrics, string>

const getMetrics = (prefix: string, histogramBuckets: number[]): Metrics => {
  const names = getMetricNames(prefix)

  return {
    countGauge: new prometheus.Gauge({
      name: names.countGauge,
      help: 'Total number of jobs',
      labelNames: ['status', 'queue'] as const,
    }),
    processedDuration: new prometheus.Histogram({
      name: names.processedDuration,
      help: 'Processing time of a jobs (processing until finished)',
      buckets: histogramBuckets,
      labelNames: ['status', 'queue'] as const,
    }),
    finishedDuration: new prometheus.Histogram({
      name: names.finishedDuration,
      help: 'Finish time for jobs (created until finished)',
      buckets: histogramBuckets,
      labelNames: ['status', 'queue'] as const,
    }),
  }
}

export class MetricsCollector {
  private readonly metrics: Metrics
  private readonly options: MetricCollectorOptions
  private readonly registry: prometheus.Registry
  private readonly logger: FastifyBaseLogger

  private observedQueues: ObservableQueue[] | undefined

  constructor(
    options: MetricCollectorOptions,
    registry: prometheus.Registry,
    logger: FastifyBaseLogger,
  ) {
    this.options = options
    this.registry = registry
    this.logger = logger
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
            new ObservableQueue(queue.queueName, queue.redisConfig, this.metrics, this.logger),
        )
    }

    // The callback has to *return* the promise - otherwise the pool resolves immediately and
    // collect() reports success before a single gauge has been updated, while any rejection
    // escapes as an unhandled rejection instead of being surfaced here.
    const { errors } = await PromisePool.for(this.observedQueues).process(
      (queue: ObservableQueue) => queue.collect(),
    )

    for (const error of errors) {
      this.logger.warn(error, `Failed to collect metrics for queue ${error.item.name}`)
    }
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
    // A second collector sharing the registry has to reuse what is already on it - registering
    // the same metric name twice is an error. The registry is keyed by Prometheus metric name,
    // while `Metrics` is keyed by our own property names, so the two are mapped back together.
    const registered = Object.entries(getMetricNames(metricsPrefix)).map(
      ([key, name]) => [key, registry.getSingleMetric(name)] as const,
    )
    if (registered.every(([, metric]) => metric)) {
      return Object.fromEntries(registered) as unknown as Metrics
    }

    const metrics = getMetrics(metricsPrefix, histogramBuckets)
    for (const metric of Object.values(metrics)) {
      registry.registerMetric(metric)
    }

    return metrics
  }
}
