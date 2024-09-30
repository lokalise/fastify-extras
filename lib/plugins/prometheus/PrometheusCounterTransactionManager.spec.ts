import { TEST_OPTIONS, buildClient, sendGet } from '@lokalise/backend-http-client'
import fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { metricsPlugin } from '../metricsPlugin'
import { PrometheusCounterTransactionManager } from './PrometheusCounterTransactionManager'

describe('PrometheusCounterTransactionManager', () => {
  describe('appMetrics is undefined', () => {
    it('should not throw errors', () => {
      const transactionManager = new PrometheusCounterTransactionManager('test', 'test', undefined)
      transactionManager.start('test', 'test')
      transactionManager.stop('test')
      transactionManager.startWithGroup('test2', 'test2', 'test2')
      transactionManager.stop('test2', false)
    })
  })

  describe('appMetrics is defined', () => {
    const initApp = async () => {
      const app = fastify()
      await app.register(metricsPlugin, {
        bindAddress: '0.0.0.0',
        logger: false,
        errorObjectResolver: () => undefined,
      })

      await app.ready()
      return app
    }

    let app: FastifyInstance

    beforeAll(async () => {
      app = await initApp()
    })

    afterAll(async () => {
      await app.close()
    })

    it('returns counter metrics', async () => {
      const counterManager = new PrometheusCounterTransactionManager(
        'myMetric',
        'this is my first metric',
        app.metrics,
      )

      counterManager.start('myTransaction', 'myKey1')
      counterManager.stop('myKey1')

      counterManager.startWithGroup('myTransaction', 'myKey2', 'group1')
      counterManager.stop('myKey2', true)

      counterManager.start('myTransaction', 'myKey3')
      counterManager.stop('myKey3', false)

      const response = await sendGet(buildClient('http://127.0.0.1:9080'), '/metrics', TEST_OPTIONS)
      expect(response.result.statusCode).toBe(200)
      expect(response.result.body).toContain(
        [
          '# HELP myMetric this is my first metric',
          '# TYPE myMetric counter',
          'myMetric{status="started",transactionName="myTransaction"} 3',
          'myMetric{status="success",transactionName="myTransaction"} 2',
          'myMetric{status="failed",transactionName="myTransaction"} 1',
        ].join('\n'),
      )

      // registering metric with same name but different description -> should be the same metric
      const counterManager2 = new PrometheusCounterTransactionManager(
        'myMetric',
        'this is my second metric',
        app.metrics,
      )
      counterManager2.start('myTransaction', 'myKey4')
      counterManager2.stop('myKey4', false)

      const response2 = await sendGet(
        buildClient('http://127.0.0.1:9080'),
        '/metrics',
        TEST_OPTIONS,
      )
      expect(response2.result.statusCode).toBe(200)
      expect(response2.result.body).toContain(
        [
          '# HELP myMetric this is my first metric',
          '# TYPE myMetric counter',
          'myMetric{status="started",transactionName="myTransaction"} 4',
          'myMetric{status="success",transactionName="myTransaction"} 2',
          'myMetric{status="failed",transactionName="myTransaction"} 2',
        ].join('\n'),
      )
    })
  })
})
