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

async function plugin(
  fastify: FastifyInstance,
  pluginOptions: BullMqMetricsPluginOptions,
) {
  if (!fastify.metrics) {
    throw new Error('No Prometheus Client found, BullMQ metrics plugin requires `fastify-metrics` plugin to be registered')
  }

  try {
    const collector = new MetricsCollector(
      pluginOptions.redisClient,
      fastify.metrics.client.register,
      fastify.log,
      pluginOptions,
    )

    fastify.addHook('onClose', () => {
      collector.stop()
    })

    await collector.start()
  } catch (err: unknown) {
    throw err instanceof Error
        ? err
        : new Error('Unknown error in bull-mq-metrics-plugin', { cause: err })
  }
}

export const bullMqMetricsPlugin = fp<BullMqMetricsPluginOptions>(plugin, {
  fastify: '4.x',
  name: 'bull-mq-metrics-plugin',
})
