import { backgroundJobProcessorGetActiveQueueIds } from '@lokalise/background-jobs-common'
import type { Redis } from 'ioredis'

export type QueueDiscoverer = {
  getRedisInstanceWithQueues: () => Promise<RedisInstanceWithQueues>
  discoverQueues: () => Promise<string[]>
}

type RedisInstanceWithQueues = {
  redisInstance: Redis
  queues: string[]
}

export class RedisBasedQueueDiscoverer implements QueueDiscoverer {
  constructor(
    private readonly redis: Redis,
    private readonly queuesPrefix: string,
  ) {}

  async getRedisInstanceWithQueues(): Promise<RedisInstanceWithQueues> {
    return {
      redisInstance: this.redis,
      queues: await this.discoverQueues(),
    }
  }

  async discoverQueues(): Promise<string[]> {
    const scanStream = this.redis.scanStream({
      match: `${this.queuesPrefix}:*:meta`,
    })

    const queues = new Set<string>()
    for await (const chunk of scanStream) {
      // biome-ignore lint/complexity/noForEach: <explanation>
      ;(chunk as string[])
        .map((key) => key.split(':')[1])
        .filter((value) => !!value)
        .forEach((queue) => queues.add(queue))
    }

    return Array.from(queues).sort()
  }
}

export class BackgroundJobsBasedQueueDiscoverer implements QueueDiscoverer {
  constructor(private readonly redis: Redis) {}

  async getRedisInstanceWithQueues(): Promise<RedisInstanceWithQueues> {
    return {
      redisInstance: this.redis,
      queues: await this.discoverQueues(),
    }
  }

  async discoverQueues(): Promise<string[]> {
    return await backgroundJobProcessorGetActiveQueueIds(this.redis)
  }
}
