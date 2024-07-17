import type { FastifyInstance } from 'fastify'
import 'fastify-metrics'
import fp from 'fastify-plugin'
import type { Redis } from 'ioredis'

import { MetricsCollector } from './bull-mq-metrics/MetricsCollector'
import type { QueueDiscoverer } from './bull-mq-metrics/queueDiscoverers'

export type BullMqMetricsPluginOptions = {
  redisClient: Redis
  bullMqPrefix?: string
  metricsPrefix?: string
  queueDiscoverer?: QueueDiscoverer
  excludedQueues?: string[]
  collectionIntervalInMs?: number
  histogramBuckets?: number[]
}

function plugin(
  fastify: FastifyInstance,
  pluginOptions: BullMqMetricsPluginOptions,
  next: (err?: Error) => void,
) {
  try {
    const promClient = fastify.metrics.client
    if (!promClient) {
      return next(
        new Error(
          'No Prometheus Client found, BullMQ metrics plugin requires `fastify-metrics` plugin to be registered',
        ),
      )
    }

    const collector = new MetricsCollector(
      pluginOptions.redisClient,
      promClient.register,
      pluginOptions,
    )

    void collector.start()

    fastify.addHook('onClose', () => {
      collector.stop()
    })
  } catch (err: unknown) {
    return next(
      err instanceof Error
        ? err
        : new Error('Unknown error in bull-mq-metrics-plugin', { cause: err }),
    )
  }

  next()
}

export const bullMqMetricsPlugin = fp<BullMqMetricsPluginOptions>(plugin, {
  fastify: '4.x',
  name: 'bull-mq-metrics-plugin',
})
