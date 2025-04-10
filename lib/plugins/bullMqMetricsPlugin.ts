import type { FastifyInstance, FastifyPluginCallback } from 'fastify'
import 'fastify-metrics'
import fp from 'fastify-plugin'

import type { RedisConfig } from '@lokalise/node-core'
import type { CollectionScheduler } from './bull-mq-metrics/CollectionScheduler.js'
import { PromiseBasedCollectionScheduler } from './bull-mq-metrics/CollectionScheduler.js'
import type { MetricCollectorOptions } from './bull-mq-metrics/MetricsCollector.js'
import { MetricsCollector } from './bull-mq-metrics/MetricsCollector.js'
import { BackgroundJobsBasedQueueDiscoverer } from './bull-mq-metrics/queueDiscoverers.js'

// Augment existing FastifyRequest interface with new fields
declare module 'fastify' {
  interface FastifyInstance {
    bullMqMetrics: {
      collect: () => Promise<void>
    }
  }
}

export type BullMqMetricsPluginOptions = {
  redisConfigs: RedisConfig[]
  collectionOptions?:
    | {
        type: 'interval'
        intervalInMs: number
      }
    | {
        type: 'manual'
      }
} & Partial<MetricCollectorOptions>

function plugin(
  fastify: FastifyInstance,
  pluginOptions: BullMqMetricsPluginOptions,
  next: (err?: Error) => void,
) {
  if (!fastify.metrics) {
    return next(
      new Error(
        'No Prometheus Client found, BullMQ metrics plugin requires `fastify-metrics` plugin to be registered',
      ),
    )
  }

  const options = {
    bullMqPrefix: 'bull',
    metricsPrefix: 'bullmq',
    queueDiscoverer: new BackgroundJobsBasedQueueDiscoverer(pluginOptions.redisConfigs),
    excludedQueues: [],
    histogramBuckets: [20, 50, 150, 400, 1000, 3000, 8000, 22000, 60000, 150000],
    collectionOptions: {
      type: 'interval',
      intervalInMs: 5000,
    },
    ...pluginOptions,
  } satisfies MetricCollectorOptions

  try {
    const collector = new MetricsCollector(options, fastify.metrics.client.register, fastify.log)
    const collectFn = async () => await collector.collect()
    let scheduler: CollectionScheduler

    if (options.collectionOptions.type === 'interval') {
      scheduler = new PromiseBasedCollectionScheduler(
        options.collectionOptions.intervalInMs,
        collectFn,
      )

      // Void is set so the scheduler can run indefinitely
      void scheduler.start()
    }

    fastify.addHook('onClose', async () => {
      if (scheduler) {
        scheduler.stop()
      }
      await collector.dispose()
    })

    fastify.decorate('bullMqMetrics', {
      collect: collectFn,
    })

    next()
  } catch (err: unknown) {
    return next(
      err instanceof Error
        ? err
        : new Error('Unknown error in bull-mq-metrics-plugin', { cause: err }),
    )
  }
}

export const bullMqMetricsPlugin: FastifyPluginCallback<BullMqMetricsPluginOptions> =
  fp<BullMqMetricsPluginOptions>(plugin, {
    fastify: '5.x',
    name: 'bull-mq-metrics-plugin',
  })
