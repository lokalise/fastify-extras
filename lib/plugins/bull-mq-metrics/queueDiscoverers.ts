import { backgroundJobProcessorGetActiveQueueIds } from '@lokalise/background-jobs-common'
import type { Redis } from 'ioredis'

export type QueueDiscoverer = {
  discoverQueues: () => Promise<RedisQueue[]>
}

type RedisQueue = {
  redisInstance: Redis
  queueName: string
}

export class RedisBasedQueueDiscoverer implements QueueDiscoverer {
  constructor(
    private readonly redisInstances: Redis[],
    private readonly queuesPrefix: string,
  ) {}

  async discoverQueues(): Promise<RedisQueue[]> {
    return Promise.all(
      this.redisInstances.map((redisInstance) => this.discoverQueuesForInstance(redisInstance)),
    ).then((queues) => queues.flat())
  }

  private async discoverQueuesForInstance(redisInstance: Redis): Promise<RedisQueue[]> {
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

export class BackgroundJobsBasedQueueDiscoverer implements QueueDiscoverer {
  constructor(private readonly redisInstances: Redis[]) {}

  async discoverQueues(): Promise<RedisQueue[]> {
    return Promise.all(
      this.redisInstances.map((redisInstance) => this.discoverQueuesForInstance(redisInstance)),
    ).then((queues) => queues.flat())
  }

  private async discoverQueuesForInstance(redisInstance: Redis): Promise<RedisQueue[]> {
    return backgroundJobProcessorGetActiveQueueIds(redisInstance).then((queueNames) =>
      queueNames.map((queueName) => ({
        redisInstance,
        queueName,
      })),
    )
  }
}
