import type { FastifyInstance } from 'fastify'
import 'fastify-metrics'
import fp from 'fastify-plugin'

import { MetricsCollector } from './bull-mq-metrics/MetricsCollector'

export type BullMqMetricsPluginOptions = {
  bullMqPrefix: string
  metricsPrefix: string
  excludedQueues: string[]
  collectionIntervalInMs: number
  histogramBuckets: number[]
}

function plugin(
  fastify: FastifyInstance,
  pluginOptions: BullMqMetricsPluginOptions,
  next: (err?: Error) => void,
) {
  try {
    const promClient = fastify.metrics.client
    if (!promClient) {
      return next(new Error('Prometheus client is not registered'))
    }

    const collector = new MetricsCollector(
      fastify.diContainer.cradle.redis,
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
