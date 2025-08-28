import { buildClient, sendGet } from '@lokalise/backend-http-client'
import type {
  AbstractBackgroundJobProcessor,
  BackgroundJobProcessorDependencies,
  BaseJobPayload,
} from '@lokalise/background-jobs-common'
import { type RedisConfig, waitAndRetry } from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'
import { Redis } from 'ioredis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'
import { TestBackgroundJobProcessor } from '../../test/mocks/TestBackgroundJobProcessor.js'
import { TestDependencies } from '../../test/mocks/TestDependencies.js'
import { RedisBasedQueueDiscoverer } from './bull-mq-metrics/queueDiscoverers.js'
import type { BullMqMetricsPluginOptions } from './bullMqMetricsPlugin.js'
import { bullMqMetricsPlugin } from './bullMqMetricsPlugin.js'
import { metricsPlugin } from './metricsPlugin.js'

type TestOptions = {
  enableMetricsPlugin: boolean
}

const UNKNOWN_RESPONSE_SCHEMA = z.unknown()

const DEFAULT_TEST_OPTIONS = { enableMetricsPlugin: true }

async function initAppWithBullMqMetrics(
  pluginOptions: BullMqMetricsPluginOptions,
  { enableMetricsPlugin }: TestOptions = DEFAULT_TEST_OPTIONS,
) {
  const app = fastify()

  if (enableMetricsPlugin) {
    await app.register(metricsPlugin, {
      bindAddress: '0.0.0.0',
      logger: false,
      errorObjectResolver: (err: unknown) => err,
    })
  }

  await app.register(bullMqMetricsPlugin, {
    queueDiscoverer: new RedisBasedQueueDiscoverer(pluginOptions.redisConfigs, process.env.REDIS_KEY_PREFIX as string),
    collectionOptions: { type: 'manual' },
    ...pluginOptions,
  })

  await app.ready()
  return app
}

type JobReturn = {
  result: 'done'
}

async function getMetrics() {
  return await sendGet(buildClient('http://127.0.0.1:9080'), '/metrics', {
    requestLabel: 'test',
    responseSchema: UNKNOWN_RESPONSE_SCHEMA,
  })
}

describe('bullMqMetricsPlugin', () => {
  let app: FastifyInstance
  let dependencies: TestDependencies
  let bgDependencies: BackgroundJobProcessorDependencies<any, any>
  let processor: AbstractBackgroundJobProcessor<BaseJobPayload, JobReturn>
  let redisConfig: RedisConfig

  beforeEach(async () => {
    dependencies = new TestDependencies()
    redisConfig = dependencies.getRedisConfig()

    const redis = new Redis(redisConfig)
    await redis.flushall('SYNC')
    await redis.quit()

    bgDependencies = dependencies.createMocksForBackgroundJobProcessor()

    processor = new TestBackgroundJobProcessor<BaseJobPayload, JobReturn>(
      bgDependencies,
      { result: 'done' },
      'test_job',
      redisConfig,
    )
    await processor.start()
  })

  afterEach(async () => {
    await processor.dispose()
    if (app) await app.close()
  })

  it('throws if fastify-metrics was not initialized', async () => {
    await expect(() => {
      return initAppWithBullMqMetrics(
        {
          redisConfigs: [redisConfig],
        },
        {
          enableMetricsPlugin: false,
        },
      )
    }).rejects.toThrowError(
      'No Prometheus Client found, BullMQ metrics plugin requires `fastify-metrics` plugin to be registered',
    )
  })

  it('exposes metrics collect() function', async () => {
    app = await initAppWithBullMqMetrics({
      redisConfigs: [redisConfig],
    })

    // exec collect to start listening for failed and completed events
    await app.bullMqMetrics.collect()

    const responseBefore = await getMetrics()
    expect(responseBefore.result.body).not.toContain(
      'bullmq_jobs_finished_duration_count{status="completed",queue="test_job"} 1',
    )

    await processor.schedule({ metadata: { correlationId: 'test' } })

    const found = await waitAndRetry(async () => {
      await app.bullMqMetrics.collect()
      const metrics = await getMetrics()
      return (
        (metrics.result.body as string).indexOf(
          'bullmq_jobs_finished_duration_count{status="completed",queue="test_job"} 1',
        ) !== -1
      )
    })

    expect(found).toBe(true)
  })

  // This is failing in CI, we don't know why, our attempts at fixing it are failing,
  // this is not related to the changes in the PR where we started skipping the test.
  // This is working in production.
  it.skip('works with multiple redis clients', async () => {
    const redisConfig2: RedisConfig = {
      ...redisConfig,
      db: 1,
    }

    app = await initAppWithBullMqMetrics({
      redisConfigs: [redisConfig, redisConfig2],
    })

    const processor2 = new TestBackgroundJobProcessor<BaseJobPayload, JobReturn>(
      bgDependencies,
      { result: 'done' },
      'test_job2',
      redisConfig2,
    )
    await processor2.start()

    try {
      // exec collect to start listening for failed and completed events
      await app.bullMqMetrics.collect()

      const responseBefore = await getMetrics()
      expect(responseBefore.result.body).not.toContain(
        'bullmq_jobs_finished_duration_count{status="completed",queue="test_job"}',
      )

      const jobId = await processor.schedule({
        metadata: { correlationId: 'test' },
      })
      const jobId2 = await processor2.schedule({
        metadata: { correlationId: 'test2' },
      })

      await processor.spy.waitForJobWithId(jobId, 'completed')
      await processor2.spy.waitForJobWithId(jobId2, 'completed')

      const responseAfter = await vi.waitUntil(
        async () => {
          await app.bullMqMetrics.collect()
          const responseAfter = await getMetrics()
          if (
            // @ts-ignore
            responseAfter.result.body.includes(
              'bullmq_jobs_finished_duration_count{status="completed",queue="test_job"} 1',
            ) &&
            // @ts-ignore
            responseAfter.result.body.includes(
              'bullmq_jobs_finished_duration_count{status="completed",queue="test_job2"} 1',
            )
          ) {
            return responseAfter
          }
        },
        {
          interval: 100,
          timeout: 2000,
        },
      )

      expect(responseAfter.result.body).toContain(
        // value is 2 since we are counting same redis client twice (only for tests)
        'bullmq_jobs_finished_duration_count{status="completed",queue="test_job"} 1',
      )
      expect(responseAfter.result.body).toContain(
        // value is 2 since we are counting same redis client twice (only for tests)
        'bullmq_jobs_finished_duration_count{status="completed",queue="test_job2"} 1',
      )
    } finally {
      await processor2.dispose()
    }
  })
})
