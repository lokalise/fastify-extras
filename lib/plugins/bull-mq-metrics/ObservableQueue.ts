import { Queue, QueueEvents } from 'bullmq'
import type { FastifyBaseLogger } from 'fastify'
import type { Redis } from 'ioredis'

import type { Metrics } from './MetricsCollector'

export class ObservableQueue {
  private readonly queue: Queue
  private readonly events: QueueEvents

  constructor(
    readonly name: string,
    private readonly redis: Redis,
    private readonly metrics: Metrics,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.queue = new Queue(name, { connection: redis })
    this.events = new QueueEvents(name, { connection: redis })

    this.events.on('completed', (completedJob: { jobId: string }) => {
      this.queue
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
  }

  async collect() {
    const { completed, active, delayed, failed, waiting } = await this.queue.getJobCounts()

    this.metrics.activeGauge.labels({ queue: this.name }).set(active)
    this.metrics.completedGauge.labels({ queue: this.name }).set(completed)
    this.metrics.delayedGauge.labels({ queue: this.name }).set(delayed)
    this.metrics.failedGauge.labels({ queue: this.name }).set(failed)
    this.metrics.waitingGauge.labels({ queue: this.name }).set(waiting)
  }

  async dispose() {
    await this.events.close()
    await this.queue.close()
  }
}
