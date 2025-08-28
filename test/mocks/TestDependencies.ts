import type { BackgroundJobProcessorDependencies } from '@lokalise/background-jobs-common'
import { CommonBullmqFactory } from '@lokalise/background-jobs-common'
import { type RedisConfig, globalLogger } from '@lokalise/node-core'
import type { MockInstance } from 'vitest'

const testLogger = globalLogger
export let lastInfoSpy: MockInstance
export let lastErrorSpy: MockInstance

export class TestDependencies {
  createMocksForBackgroundJobProcessor(): BackgroundJobProcessorDependencies<any, any> {
    const originalChildFn = testLogger.child.bind(testLogger)

    const originalMethodSpy = vi.spyOn(testLogger, 'child')
    originalMethodSpy.mockImplementation((...args) => {
      const childLogger = originalChildFn.apply(testLogger, args)
      lastInfoSpy = vi.spyOn(childLogger, 'info')
      lastErrorSpy = vi.spyOn(childLogger, 'error')
      return childLogger
    })

    return {
      bullmqFactory: new CommonBullmqFactory(),
      transactionObservabilityManager: {
        start: vi.fn(),
        stop: vi.fn(),
      } as never,
      logger: testLogger,
      errorReporter: {
        report: vi.fn(),
      } as never,
    }
  }

  getRedisConfig(): RedisConfig {
    const host = process.env.REDIS_HOST
    const keyPrefix = process.env.REDIS_KEY_PREFIX
    const port = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : undefined
    const username = process.env.REDIS_USERNAME
    const password = process.env.REDIS_PASSWORD
    const connectTimeout = process.env.REDIS_CONNECT_TIMEOUT
      ? Number.parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10)
      : undefined
    const commandTimeout = process.env.REDIS_COMMAND_TIMEOUT
      ? Number.parseInt(process.env.REDIS_COMMAND_TIMEOUT, 10)
      : undefined

    if (!host) {
      throw new Error('Missing REDIS_HOST env')
    }

    if (!port) {
      throw new Error('Missing REDIS_PORT env')
    }

    return {
      host,
      keyPrefix,
      port,
      username,
      password,
      connectTimeout,
      commandTimeout,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      useTls: false,
    }
  }
}
