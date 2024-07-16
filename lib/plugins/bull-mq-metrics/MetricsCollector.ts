import { Queue, QueueEvents } from 'bullmq'
import type Redis from 'ioredis'
import * as prometheus from 'prom-client'

import type { BullMqMetricsPluginOptions } from '../bullMqMetricsPlugin'

type Metrics = {
  completedGauge: prometheus.Gauge<never>
  activeGauge: prometheus.Gauge<never>
  delayedGauge: prometheus.Gauge<never>
  failedGauge: prometheus.Gauge<never>
  waitingGauge: prometheus.Gauge<never>
  completedDuration: prometheus.Histogram<never>
  processedDuration: prometheus.Histogram<never>
}

export class MetricsCollector {
  private readonly options: BullMqMetricsPluginOptions
  private readonly metrics: Metrics
  private active = true

  constructor(
    private readonly redis: Redis,
    private readonly registry: prometheus.Registry,
    options: Partial<BullMqMetricsPluginOptions>,
  ) {
    this.options = {
      bullMqPrefix: 'bull',
      metricsPrefix: 'bullmq',
      excludedQueues: [],
      collectionIntervalInMs: 5000,
      histogramBuckets: [20, 50, 150, 400, 1000, 3000, 8000, 22000, 60000, 150000],
      ...options,
    }

    this.metrics = this.registerMetrics(this.registry, this.options)
  }

  async start() {
    const queueNames = await this.findQueues(this.redis, this.options)
    await Promise.all(
      queueNames.map((name) => this.observeQueue(name, this.redis, this.metrics, this.options)),
    )
  }

  stop() {
    this.active = false
  }

  private registerMetrics(
    registry: prometheus.Registry,
    { metricsPrefix, histogramBuckets }: BullMqMetricsPluginOptions,
  ): Metrics {
    const metrics: Metrics = {
      completedGauge: new prometheus.Gauge({
        name: `${metricsPrefix}_jobs_completed`,
        help: 'Total number of completed jobs',
        labelNames: ['queue'],
      }),
      activeGauge: new prometheus.Gauge({
        name: `${metricsPrefix}_jobs_active`,
        help: 'Total number of active jobs (currently being processed)',
        labelNames: ['queue'],
      }),
      failedGauge: new prometheus.Gauge({
        name: `${metricsPrefix}_jobs_failed`,
        help: 'Total number of failed jobs',
        labelNames: ['queue'],
      }),
      delayedGauge: new prometheus.Gauge({
        name: `${metricsPrefix}_jobs_delayed`,
        help: 'Total number of jobs that will run in the future',
        labelNames: ['queue'],
      }),
      waitingGauge: new prometheus.Gauge({
        name: `${metricsPrefix}_jobs_waiting`,
        help: 'Total number of jobs waiting to be processed',
        labelNames: ['queue'],
      }),
      processedDuration: new prometheus.Histogram({
        name: `${metricsPrefix}_jobs_processed_duration`,
        help: 'Processing time for completed jobs (processing until completed)',
        buckets: histogramBuckets,
        labelNames: ['queue'],
      }),
      completedDuration: new prometheus.Histogram({
        name: `${metricsPrefix}_jobs_completed_duration`,
        help: 'Completion time for jobs (created until completed)',
        buckets: histogramBuckets,
        labelNames: ['queue'],
      }),
    }

    for (const metric of Object.values(metrics)) {
      registry.registerMetric(metric)
    }

    return metrics
  }

  private async findQueues(
    redis: Redis,
    { bullMqPrefix }: BullMqMetricsPluginOptions,
  ): Promise<string[]> {
    const scanStream = redis.scanStream({
      match: `${bullMqPrefix}:*:meta`,
    })

    const queues = new Set<string>()
    for await (const chunk of scanStream) {
      (chunk as string[])
        .map((key) => key.split(':')[1])
        .filter((value) => !!value)
        .forEach((queue) => queues.add(queue))
    }

    return Array.from(queues)
  }

  private async observeQueue(
    name: string,
    redis: Redis,
    metrics: Metrics,
    { collectionIntervalInMs }: BullMqMetricsPluginOptions,
  ) {
    const queue = new Queue(name, { connection: redis })
    const events = new QueueEvents(name, { connection: redis })

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    events.on('completed', async (completedJob: { jobId: string }) => {
      const job = await queue.getJob(completedJob.jobId)
      if (!job) {
        return
      }

      if (job.finishedOn) {
        metrics.completedDuration.labels({ queue: name }).observe(job.finishedOn - job.timestamp)

        if (job.processedOn) {
          metrics.processedDuration
            .labels({ queue: name })
            .observe(job.finishedOn - job.processedOn)
        }
      }
    })

    while (this.active) {
      const { completed, active, delayed, failed, waiting } = await queue.getJobCounts()

      metrics.activeGauge.labels({ queue: name }).set(active)
      metrics.completedGauge.labels({ queue: name }).set(completed)
      metrics.delayedGauge.labels({ queue: name }).set(delayed)
      metrics.failedGauge.labels({ queue: name }).set(failed)
      metrics.waitingGauge.labels({ queue: name }).set(waiting)

      await new Promise((resolve) => setTimeout(resolve, collectionIntervalInMs))
    }

    await events.close()
    await queue.close()
  }
}
