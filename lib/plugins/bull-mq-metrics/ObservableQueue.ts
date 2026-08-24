import { sanitizeRedisConfig } from '@lokalise/background-jobs-common'
import type { RedisConfig } from '@lokalise/node-core'
import { Queue, QueueEvents } from 'bullmq'
import type { FinishedStatus, JobType } from 'bullmq'
import type { FastifyBaseLogger } from 'fastify'
import type { Metrics } from './MetricsCollector.js'

/**
 * bullmq v6 dropped the `paused` job state - pausing no longer moves jobs onto a separate
 * list, they stay in `waiting` - so it is gone from the exported `JobType` union. We keep
 * asking for it on both majors anyway: v5 tracks it natively, and a queue paused under v5
 * leaves a `paused` list behind that v6 only drains once the queue is resumed, so dropping
 * the state would silently hide that backlog mid-upgrade. The two counts read different
 * Redis keys, so nothing is counted twice.
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

  get name() {
    return this.queue.name
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
