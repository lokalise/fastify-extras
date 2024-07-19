import { setTimeout } from 'node:timers/promises'

import { Queue, QueueEvents } from 'bullmq'
import type { FastifyBaseLogger } from 'fastify'
import type { Redis } from 'ioredis'
import * as prometheus from 'prom-client'

import type { BullMqMetricsPluginOptions } from '../bullMqMetricsPlugin'

import { BackgroundJobsBasedQueueDiscoverer } from './queueDiscoverers'

type Metrics = {
  completedGauge: prometheus.Gauge<never>
  activeGauge: prometheus.Gauge<never>
  delayedGauge: prometheus.Gauge<never>
  failedGauge: prometheus.Gauge<never>
  waitingGauge: prometheus.Gauge<never>
  completedDuration: prometheus.Histogram<never>
  processedDuration: prometheus.Histogram<never>
}

type MetricCollectorOptions = Required<Omit<BullMqMetricsPluginOptions, 'redisClient'>>

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
  private readonly options: MetricCollectorOptions
  private readonly metrics: Metrics
  private active = true

  constructor(
    private readonly redis: Redis,
    private readonly registry: prometheus.Registry,
    private readonly logger: FastifyBaseLogger,
    options: Partial<MetricCollectorOptions>,
  ) {
    this.options = {
      bullMqPrefix: 'bull',
      metricsPrefix: 'bullmq',
      excludedQueues: [],
      collectionIntervalInMs: 5000,
      histogramBuckets: [20, 50, 150, 400, 1000, 3000, 8000, 22000, 60000, 150000],
      queueDiscoverer: new BackgroundJobsBasedQueueDiscoverer(this.redis),
      ...options,
    }

    this.metrics = this.registerMetrics(this.registry, this.options)
  }

  async start() {
    const queueNames = await this.options.queueDiscoverer.discoverQueues()

    // `void` is used to run the `observeQueue` function without waiting for it to finish
    void Promise.all(
      queueNames.map((name) => this.observeQueue(name, this.redis, this.metrics, this.options)),
    )
  }

  stop() {
    this.active = false
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

  private async observeQueue(
    name: string,
    redis: Redis,
    metrics: Metrics,
    { collectionIntervalInMs }: MetricCollectorOptions,
  ) {
    const queue = new Queue(name, { connection: redis })
    const events = new QueueEvents(name, { connection: redis })

    events.on('completed', (completedJob: { jobId: string }) => {
      queue
        .getJob(completedJob.jobId)
        .then((job) => {
          if (!job) {
            return
          }

          if (job.finishedOn) {
            metrics.completedDuration
              .labels({ queue: name })
              .observe(job.finishedOn - job.timestamp)

            if (job.processedOn) {
              metrics.processedDuration
                .labels({ queue: name })
                .observe(job.finishedOn - job.processedOn)
            }
          }
        })
        .catch((err) => {
          this.logger.warn(err)
        })
    })

    while (this.active) {
      const { completed, active, delayed, failed, waiting } = await queue.getJobCounts()

      metrics.activeGauge.labels({ queue: name }).set(active)
      metrics.completedGauge.labels({ queue: name }).set(completed)
      metrics.delayedGauge.labels({ queue: name }).set(delayed)
      metrics.failedGauge.labels({ queue: name }).set(failed)
      metrics.waitingGauge.labels({ queue: name }).set(waiting)

      await setTimeout(collectionIntervalInMs)
    }

    await events.close()
    await queue.close()
  }
}
