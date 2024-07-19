import { buildClient, sendGet, UNKNOWN_RESPONSE_SCHEMA } from '@lokalise/backend-http-client'
import type { AbstractBackgroundJobProcessor, BaseJobPayload } from '@lokalise/background-jobs-common'
import type { FastifyInstance } from 'fastify';
import fastify from 'fastify'
import type { Redis } from 'ioredis'

import { TestBackgroundJobProcessor } from '../../test/mocks/TestBackgroundJobProcessor'
import { DependencyMocks } from '../../test/mocks/dependencyMocks'

import { RedisBasedQueueDiscoverer } from './bull-mq-metrics/queueDiscoverers'
import { bullMqMetricsPlugin } from './bullMqMetricsPlugin'
import { metricsPlugin } from './metricsPlugin'

async function initApp(redis: Redis, errorObjectResolver = (err: unknown) => err) {
  const app = fastify()
  await app.register(metricsPlugin, {
    bindAddress: '0.0.0.0',
    loggerOptions: false,
    errorObjectResolver,
  })

  await app.register(bullMqMetricsPlugin, {
    redisClient: redis,
    queueDiscoverer: new RedisBasedQueueDiscoverer(redis, 'bull'),
    collectionIntervalInMs: 100
  })

  await app.ready()
  return app
}

type JobReturn = {
  result: 'done'
}

describe('bullMqMetricsPlugin', () => {
  let app: FastifyInstance
  let mocks: DependencyMocks
  let processor: AbstractBackgroundJobProcessor<BaseJobPayload, JobReturn>
  let redis: Redis

  beforeEach(async () => {
    mocks = new DependencyMocks()
    redis = mocks.startRedis()
    await redis?.flushall('SYNC')

    mocks.create()

    processor = new TestBackgroundJobProcessor<BaseJobPayload, JobReturn>(mocks.create(), { result: 'done' }, 'test_job')
    await processor.start()

    app = await initApp(redis)
  })

  afterEach(async () => {
    await app.close()
    await mocks.dispose()
    await processor.dispose()
  })

  it('adds BullMQ metrics to Prometheus metrics endpoint', async () => {
    await processor.schedule({
      metadata: {
        correlationId: 'test'
      }
    })

    const response = await sendGet(buildClient('http://127.0.0.1:9080'), '/metrics', {
      requestLabel: 'test',
      responseSchema: UNKNOWN_RESPONSE_SCHEMA,
    })

    expect(response.result.statusCode).toBe(200)
    expect(response.result.body).toContain('bullmq_jobs_completed{queue="test_job"}')
  })
})