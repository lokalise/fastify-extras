import { setTimeout } from 'node:timers/promises'

import { buildClient, sendGet } from '@lokalise/backend-http-client'
import {
  type AbstractBackgroundJobProcessor,
  type BaseJobPayload,
  createSanitizedRedisClient,
} from '@lokalise/background-jobs-common'
import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import { TestBackgroundJobProcessor } from '../../test/mocks/TestBackgroundJobProcessor'
import { TestDepedendencies } from '../../test/mocks/TestDepedendencies'

import type { RedisConfig } from '@lokalise/node-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { RedisBasedQueueDiscoverer } from './bull-mq-metrics/queueDiscoverers'
import type { BullMqMetricsPluginOptions } from './bullMqMetricsPlugin'
import { bullMqMetricsPlugin } from './bullMqMetricsPlugin'
import { metricsPlugin } from './metricsPlugin'

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
      loggerOptions: false,
      errorObjectResolver: (err: unknown) => err,
    })
  }

  await app.register(bullMqMetricsPlugin, {
    queueDiscoverer: new RedisBasedQueueDiscoverer(pluginOptions.redisConfigs, 'bull'),
    collectionOptions: {
      type: 'interval',
      intervalInMs: 50,
    },
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
  let dependencies: TestDepedendencies
  let processor: AbstractBackgroundJobProcessor<BaseJobPayload, JobReturn>
  let redisConfig: RedisConfig

  beforeEach(async () => {
    dependencies = new TestDepedendencies()
    redisConfig = dependencies.getRedisConfig()

    const redis = createSanitizedRedisClient(redisConfig)
    await redis.flushall('SYNC')
    await redis.quit()

    processor = new TestBackgroundJobProcessor<BaseJobPayload, JobReturn>(
      dependencies.createMocksForBackgroundJobProcessor(),
      { result: 'done' },
      'test_job',
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
      collectionOptions: {
        type: 'manual',
      },
    })

    // exec collect to start listening for failed and completed events
    await app.bullMqMetrics.collect()

    const responseBefore = await getMetrics()
    expect(responseBefore.result.body).not.toContain(
      'bullmq_jobs_finished_duration_count{status="completed",queue="test_job"} 1',
    )

    await processor.schedule({
      metadata: {
        correlationId: 'test',
      },
    })

    await setTimeout(100)

    await app.bullMqMetrics.collect()

    const responseAfter = await getMetrics()
    expect(responseAfter.result.body).toContain(
      'bullmq_jobs_finished_duration_count{status="completed",queue="test_job"} 1',
    )
  })

  it('works with multiple redis clients', async () => {
    app = await initAppWithBullMqMetrics({
      redisConfigs: [redisConfig, redisConfig],
      collectionOptions: {
        type: 'manual',
      },
    })

    // exec collect to start listening for failed and completed events
    await app.bullMqMetrics.collect()

    const responseBefore = await getMetrics()
    expect(responseBefore.result.body).not.toContain(
      'bullmq_jobs_finished_duration_count{status="completed",queue="test_job"}',
    )

    const jobId = await processor.schedule({
      metadata: { correlationId: 'test' },
    })

    await processor.spy.waitForJobWithId(jobId, 'completed')

    const responseAfter = await vi.waitUntil(
      async () => {
        const responseAfter = await getMetrics()
        if (
          // @ts-ignore
          responseAfter.result.body.includes(
            'bullmq_jobs_finished_duration_count{status="completed",queue="test_job"} 2',
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
      'bullmq_jobs_finished_duration_count{status="completed",queue="test_job"} 2',
    )
  })
})
