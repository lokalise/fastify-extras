import { sanitizeRedisConfig } from '@lokalise/background-jobs-common'
import type { RedisConfig } from '@lokalise/node-core'
import { Queue, QueueEvents } from 'bullmq'
import type { FinishedStatus, JobType } from 'bullmq'
import type { FastifyBaseLogger } from 'fastify'
import type { Metrics } from './MetricsCollector.js'

/**
 * bullmq v6 dropped the `paused` job state (paused queues now report their backlog as
 * `waiting`), so it is no longer part of the exported `JobType` union. v5 still tracks it
 * separately, and asking v6 for it is harmless (it always resolves to 0), so we keep
 * requesting it and widen the type to stay accurate on both majors.
 */
const COUNTED_JOB_STATES: string[] = [
  'active',
  'delayed',
  'paused',
  'prioritized',
  'waiting',
  'waiting-children',
]

export class ObservableQueue {
  private readonly queue: Queue
  private readonly events: QueueEvents
  private readonly metrics: Metrics
  private readonly logger: FastifyBaseLogger

  private async collectDurationMetric(jobId: string, status: FinishedStatus) {
    try {
      const job = await this.queue.getJob(jobId)

      if (!job || !job.finishedOn) {
        return
      }

      this.metrics.finishedDuration
        .labels({ status, queue: this.queue.name })
        .observe(job.finishedOn - job.timestamp)

      if (job.processedOn) {
        this.metrics.processedDuration
          .labels({ status, queue: this.queue.name })
          .observe(job.finishedOn - job.processedOn)
      }
    } catch (err) {
      this.logger.warn(err)
    }
  }

  constructor(name: string, redisConfig: RedisConfig, metrics: Metrics, logger: FastifyBaseLogger) {
    const sanitizedConfig = sanitizeRedisConfig(redisConfig)
    this.queue = new Queue(name, {
      connection: sanitizedConfig,
      prefix: redisConfig.keyPrefix,
    })
    this.events = new QueueEvents(name, {
      connection: sanitizedConfig,
      prefix: redisConfig.keyPrefix,
      autorun: true,
    })
    this.metrics = metrics
    this.logger = logger

    this.events.on('failed', async ({ jobId }) => {
      await this.collectDurationMetric(jobId, 'failed')
    })

    this.events.on('completed', async ({ jobId }) => {
      await this.collectDurationMetric(jobId, 'completed')
    })
  }

  async collect() {
    const countByStatus = await this.queue.getJobCounts(...(COUNTED_JOB_STATES as JobType[]))

    for (const [status, count] of Object.entries(countByStatus)) {
      this.metrics.countGauge.set({ status, queue: this.queue.name }, count)
    }
  }

  async dispose() {
    await this.events.close()
    await this.queue.close()
  }
}
