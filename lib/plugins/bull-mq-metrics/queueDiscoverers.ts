import { backgroundJobProcessorGetActiveQueueIds } from '@lokalise/background-jobs-common'
import { PromisePool } from '@supercharge/promise-pool'
import { Redis, type RedisOptions } from 'ioredis'

export type QueueDiscoverer = {
  discoverQueues: () => Promise<RedisQueue[]>
}

type RedisQueue = {
  redisConfig: RedisOptions
  queueName: string
}

const QUEUE_DISCOVERY_CONCURRENCY = 3

export abstract class AbstractRedisBasedQueueDiscoverer implements QueueDiscoverer {
  protected readonly redisConfigs: RedisOptions[]

  constructor(redisConfigs: RedisOptions[]) {
    this.redisConfigs = redisConfigs
  }

  async discoverQueues(): Promise<RedisQueue[]> {
    const { results, errors } = await PromisePool.withConcurrency(QUEUE_DISCOVERY_CONCURRENCY)
      .for(this.redisConfigs)
      .process((redisInstance) => this.discoverQueuesForInstance(redisInstance))

    if (errors.length > 0) {
      // Throwing first error that was encountered
      throw errors[0]
    }

    return results.flat()
  }

  protected abstract discoverQueuesForInstance(redisConfig: RedisOptions): Promise<RedisQueue[]>
}

export class RedisBasedQueueDiscoverer extends AbstractRedisBasedQueueDiscoverer {
  private readonly queuesPrefix: string

  constructor(redisConfigs: RedisOptions[], queuesPrefix: string) {
    super(redisConfigs)
    this.queuesPrefix = queuesPrefix
  }

  protected async discoverQueuesForInstance(redisConfig: RedisOptions): Promise<RedisQueue[]> {
    const redis = new Redis(redisConfig)
    const scanStream = redis.scanStream({
      match: `${this.queuesPrefix}:*:meta`,
    })

    const queues = new Set<string>()
    for await (const chunk of scanStream) {
      for (const key of chunk as string[]) {
        const parts = key.split(':')
        if (parts.length < 3) continue
        const queue = parts[parts.length - 2] // we need the part before to meta
        if (queue) queues.add(queue)
      }
    }
    await redis.quit()

    return Array.from(queues)
      .sort()
      .map((queueName) => ({
        redisConfig,
        queueName,
      }))
  }
}

export class BackgroundJobsBasedQueueDiscoverer extends AbstractRedisBasedQueueDiscoverer {
  protected async discoverQueuesForInstance(redisConfig: RedisOptions): Promise<RedisQueue[]> {
    const redis = new Redis(redisConfig)
    try {
      const queueNames = await backgroundJobProcessorGetActiveQueueIds(redis)
      return queueNames.map((queueName) => ({
        redisConfig,
        queueName,
      }))
    } finally {
      redis.disconnect()
    }
  }
}
