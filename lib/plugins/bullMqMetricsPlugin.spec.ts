import { setTimeout } from 'node:timers/promises'

import { buildClient, sendGet, UNKNOWN_RESPONSE_SCHEMA } from '@lokalise/backend-http-client'
import type {
  AbstractBackgroundJobProcessor,
  BaseJobPayload,
} from '@lokalise/background-jobs-common'
import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'
import type { Redis } from 'ioredis'

import { TestBackgroundJobProcessor } from '../../test/mocks/TestBackgroundJobProcessor'
import { TestDepedendencies } from '../../test/mocks/TestDepedendencies'

import { RedisBasedQueueDiscoverer } from './bull-mq-metrics/queueDiscoverers'
import type { BullMqMetricsPluginOptions } from './bullMqMetricsPlugin'
import { bullMqMetricsPlugin } from './bullMqMetricsPlugin'
import { metricsPlugin } from './metricsPlugin'

type TestOptions = {
  enableMetricsPlugin: boolean
}

const DEFAULT_TEST_OPTIONS = { enableMetricsPlugin: true }

export async function initAppWithBullMqMetrics(
  pluginOptions: BullMqMetricsPluginOptions,
  { enableMetricsPlugin }: TestOptions = DEFAULT_TEST_OPTIONS,
) {
  const app = fastify()

  if (enableMetricsPlugin) {
    await app.register(metricsPlugin, {
      bindAddress: '0.0.0.0',
      loggerOptions: false,
      errorObjectResolver: (err: unknown) => err,
    })
  }

  await app.register(bullMqMetricsPlugin, {
    queueDiscoverer: new RedisBasedQueueDiscoverer(pluginOptions.redisClient, 'bull'),
    collectionIntervalInMs: 100,
    ...pluginOptions,
  })

  await app.ready()
  return app
}

type JobReturn = {
  result: 'done'
}

describe('bullMqMetricsPlugin', () => {
  let app: FastifyInstance
  let dependencies: TestDepedendencies
  let processor: AbstractBackgroundJobProcessor<BaseJobPayload, JobReturn>
  let redis: Redis

  beforeEach(async () => {
    dependencies = new TestDepedendencies()
    redis = dependencies.startRedis()
    await redis?.flushall('SYNC')

    processor = new TestBackgroundJobProcessor<BaseJobPayload, JobReturn>(
      dependencies.createMocksForBackgroundJobProcessor(),
      { result: 'done' },
      'test_job',
    )
    await processor.start()
  })

  afterEach(async () => {
    if (app) {
      await app.close()
    }
    await dependencies.dispose()
    await processor.dispose()
  })

  it('adds BullMQ metrics to Prometheus metrics endpoint', async () => {
    app = await initAppWithBullMqMetrics({
      redisClient: redis,
    })

    await processor.schedule({
      metadata: {
        correlationId: 'test',
      },
    })

    await setTimeout(100)

    const response = await sendGet(buildClient('http://127.0.0.1:9080'), '/metrics', {
      requestLabel: 'test',
      responseSchema: UNKNOWN_RESPONSE_SCHEMA,
    })

    expect(response.result.statusCode).toBe(200)
    expect(response.result.body).toContain('bullmq_jobs_completed{queue="test_job"} 1')
  })

  it('throws if fastify-metrics was not initialized', async () => {
    await expect(() => {
      return initAppWithBullMqMetrics(
        {
          redisClient: redis,
        },
        {
          enableMetricsPlugin: false,
        },
      )
    }).rejects.toThrowError(
      'No Prometheus Client found, BullMQ metrics plugin requires `fastify-metrics` plugin to be registered',
    )
  })
})
