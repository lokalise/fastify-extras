import { backgroundJobProcessorGetActiveQueueIds } from '@lokalise/background-jobs-common'
import { PromisePool } from '@supercharge/promise-pool'
import type { Redis } from 'ioredis'

export type QueueDiscoverer = {
  discoverQueues: () => Promise<RedisQueue[]>
}

type RedisQueue = {
  redisInstance: Redis
  queueName: string
}

const QUEUE_DISCOVERY_CONCURRENCY = 3

export abstract class AbstractRedisBasedQueueDiscoverer implements QueueDiscoverer {
  constructor(protected readonly redisInstances: Redis[]) {}

  async discoverQueues(): Promise<RedisQueue[]> {
    const { results, errors } = await PromisePool.withConcurrency(QUEUE_DISCOVERY_CONCURRENCY)
      .for(this.redisInstances)
      .process((redisInstance) => this.discoverQueuesForInstance(redisInstance))

    if (errors.length > 0) {
      // Throwing first error that was encountered
      throw errors[0]
    }

    return results.flat()
  }

  protected abstract discoverQueuesForInstance(redisInstance: Redis): Promise<RedisQueue[]>
}

export class RedisBasedQueueDiscoverer extends AbstractRedisBasedQueueDiscoverer {
  constructor(
    redisInstances: Redis[],
    private readonly queuesPrefix: string,
  ) {
    super(redisInstances)
  }

  protected async discoverQueuesForInstance(redisInstance: Redis): Promise<RedisQueue[]> {
    const scanStream = redisInstance.scanStream({
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

    return Array.from(queues)
      .sort()
      .map((queueName) => ({
        redisInstance: redisInstance,
        queueName,
      }))
  }
}

export class BackgroundJobsBasedQueueDiscoverer extends AbstractRedisBasedQueueDiscoverer {
  protected async discoverQueuesForInstance(redisInstance: Redis): Promise<RedisQueue[]> {
    return backgroundJobProcessorGetActiveQueueIds(redisInstance).then((queueNames) =>
      queueNames.map((queueName) => ({
        redisInstance,
        queueName,
      })),
    )
  }
}
