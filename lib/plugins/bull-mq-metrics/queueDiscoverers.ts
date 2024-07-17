import { AbstractBackgroundJobProcessor } from '@lokalise/background-jobs-common'
import type { Redis } from 'ioredis'

export type QueueDiscoverer = {
  discoverQueues: () => Promise<string[]>
}

export class RedisBasedQueueDiscoverer implements QueueDiscoverer {
  constructor(
    private readonly redis: Redis,
    private readonly queuesPrefix: string,
  ) {}

  async discoverQueues(): Promise<string[]> {
    const scanStream = this.redis.scanStream({
      match: `${this.queuesPrefix}:*:meta`,
    })

    const queues = new Set<string>()
    for await (const chunk of scanStream) {
      (chunk as string[])
        .map((key) => key.split(':')[1])
        .filter((value) => !!value)
        .forEach((queue) => queues.add(queue))
    }

    return Array.from(queues).sort()
  }
}

export class BackgroundJobsBasedQueueDiscoverer implements QueueDiscoverer {
  constructor(private readonly redis: Redis) {}

  async discoverQueues(): Promise<string[]> {
    return await AbstractBackgroundJobProcessor.getActiveQueueIds(this.redis)
  }
}
