import { backgroundJobProcessorGetActiveQueueIds } from '@lokalise/background-jobs-common'
import type { RedisConfig } from '@lokalise/node-core'
import { PromisePool } from '@supercharge/promise-pool'
import { Redis } from 'ioredis'

export type QueueDiscoverer = {
  discoverQueues: () => Promise<RedisQueue[]>
}

type RedisQueue = {
  redisConfig: RedisConfig
  queueName: string
}

const QUEUE_DISCOVERY_CONCURRENCY = 3

export abstract class AbstractRedisBasedQueueDiscoverer implements QueueDiscoverer {
  protected readonly redisConfigs: RedisConfig[]

  constructor(redisConfigs: RedisConfig[]) {
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

  protected abstract discoverQueuesForInstance(redisConfig: RedisConfig): Promise<RedisQueue[]>
}

export class RedisBasedQueueDiscoverer extends AbstractRedisBasedQueueDiscoverer {
  private readonly queuesPrefix: string

  constructor(redisConfigs: RedisConfig[], queuesPrefix: string) {
    super(redisConfigs)
    this.queuesPrefix = queuesPrefix
  }

  protected async discoverQueuesForInstance(redisConfig: RedisConfig): Promise<RedisQueue[]> {
    const redis = new Redis(redisConfig)
    const scanStream = redis.scanStream({
      match: `${this.queuesPrefix}:*:meta`,
    })

    const queues = new Set<string>()
    for await (const chunk of scanStream) {
      // biome-ignore lint/complexity/noForEach: <explanation>
      ;(chunk as string[])
        .map((key) => key.split(':')[1])
        .filter((value) => !!value)
        // biome-ignore lint/style/noNonNullAssertion: undefined removed in previous filter
        .forEach((queue) => queues.add(queue!))
    }

    return Array.from(queues)
      .sort()
      .map((queueName) => ({
        redisConfig,
        queueName,
      }))
  }
}

export class BackgroundJobsBasedQueueDiscoverer extends AbstractRedisBasedQueueDiscoverer {
  protected async discoverQueuesForInstance(redisConfig: RedisConfig): Promise<RedisQueue[]> {
    return backgroundJobProcessorGetActiveQueueIds(redisConfig).then((queueNames) =>
      queueNames.map((queueName) => ({
        redisConfig,
        queueName,
      })),
    )
  }
}
