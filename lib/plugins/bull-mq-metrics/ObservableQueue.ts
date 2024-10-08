import { Queue, QueueEvents } from 'bullmq'
import type { FinishedStatus } from 'bullmq'
import type { FastifyBaseLogger } from 'fastify'

import type { RedisConfig } from '@lokalise/node-core'
import type { Metrics } from './MetricsCollector'

export class ObservableQueue {
  private readonly queue: Queue
  private readonly events: QueueEvents

  private async collectDurationMetric(jobId: string, status: FinishedStatus) {
    try {
      const job = await this.queue.getJob(jobId)

      if (!job || !job.finishedOn) {
        return
      }

      this.metrics.finishedDuration
        .labels({ status, queue: this.name })
        .observe(job.finishedOn - job.timestamp)

      if (job.processedOn) {
        this.metrics.processedDuration
          .labels({ status, queue: this.name })
          .observe(job.finishedOn - job.processedOn)
      }
    } catch (err) {
      this.logger.warn(err)
    }
  }

  constructor(
    readonly name: string,
    readonly redisConfig: RedisConfig,
    private readonly metrics: Metrics,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.queue = new Queue(name, { connection: redisConfig })
    this.events = new QueueEvents(name, { connection: redisConfig, autorun: true })

    this.events.on('failed', async ({ jobId }) => {
      await this.collectDurationMetric(jobId, 'failed')
    })

    this.events.on('completed', async ({ jobId }) => {
      await this.collectDurationMetric(jobId, 'completed')
    })
  }

  async collect() {
    const { active, delayed, waiting } = await this.queue.getJobCounts(
      'active',
      'delayed',
      'waiting',
    )

    for (const [status, count] of Object.entries({ active, delayed, waiting })) {
      this.metrics.countGauge.set({ status, queue: this.name }, count)
    }
  }

  async dispose() {
    await this.events.close()
    await this.queue.close()
  }
}
