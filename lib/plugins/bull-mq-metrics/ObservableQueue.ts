import type { FinishedStatus, JobType } from 'bullmq'
import { Queue, QueueEvents } from 'bullmq'
import type { FastifyBaseLogger } from 'fastify'
import type { RedisOptions } from 'ioredis'
import type { Metrics } from './MetricsCollector.ts'

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

      if (!job?.finishedOn) {
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

  constructor(
    name: string,
    redisConfig: RedisOptions,
    metrics: Metrics,
    logger: FastifyBaseLogger,
  ) {
    // BullMQ applies the key prefix through its own `prefix` option and needs `maxRetriesPerRequest: null`,
    // see https://docs.bullmq.io/bull/patterns/persistent-connections#workers
    const sanitizedConfig = {
      ...redisConfig,
      keyPrefix: undefined,
      maxRetriesPerRequest: null,
      // ioredis 6 takes `retryStrategy: null` to never reconnect, which BullMQ's connection types reject.
      // A strategy that returns null stops ioredis from reconnecting the same way.
      retryStrategy: redisConfig.retryStrategy === null ? () => null : redisConfig.retryStrategy,
    }
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
