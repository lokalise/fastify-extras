import { buildClient, sendGet } from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import type { PrometheusHealthCheck } from './healthcheckMetricsPlugin'
import { healthcheckMetricsPlugin } from './healthcheckMetricsPlugin'
import { metricsPlugin } from './metricsPlugin'

async function initApp(healthChecks: PrometheusHealthCheck[]) {
  const app = fastify()
  await app.register(metricsPlugin, {
    bindAddress: '0.0.0.0',
    loggerOptions: false,
    errorObjectResolver: (err: unknown) => err,
  })
  await app.register(healthcheckMetricsPlugin, {
    healthChecks,
  })

  await app.ready()
  return app
}

describe('healthcheckMetricsPlugin', () => {
  let app: FastifyInstance
  afterEach(async () => {
    await app.close()
  })

  it('returns positive healthcheck results', async () => {
    app = await initApp([
      {
        name: 'test_healthcheck',
        // eslint-disable-next-line @typescript-eslint/require-await
        checker: async () => {
          return {
            result: {
              checkPassed: true,
              checkTimeInMsecs: 345,
            },
          }
        },
      },
    ])

    const response = await sendGet(buildClient('http://127.0.0.1:9080'), '/metrics')

    console.log(response.result.body)
    expect(response.result.statusCode).toBe(200)
    expect(response.result.body).toContain('test_healthcheck_availability 1')
    expect(response.result.body).toContain('test_healthcheck_latency_msecs 345')
  })

  it('returns negative healthcheck results', async () => {
    app = await initApp([
      {
        name: 'test_healthcheck',
        // eslint-disable-next-line @typescript-eslint/require-await
        checker: async () => {
          return {
            result: {
              checkPassed: false,
              checkTimeInMsecs: 1450,
            },
          }
        },
      },
    ])

    const response = await sendGet(buildClient('http://127.0.0.1:9080'), '/metrics')

    console.log(response.result.body)
    expect(response.result.statusCode).toBe(200)
    expect(response.result.body).toContain('test_healthcheck_availability 0')
    expect(response.result.body).toContain('test_healthcheck_latency_msecs 1450')
  })

  it('returns mixed healthcheck results', async () => {
    app = await initApp([
      {
        name: 'test_healthcheck_1',
        // eslint-disable-next-line @typescript-eslint/require-await
        checker: async () => {
          return {
            result: {
              checkPassed: true,
              checkTimeInMsecs: 345,
            },
          }
        },
      },
      {
        name: 'test_healthcheck_2',
        // eslint-disable-next-line @typescript-eslint/require-await
        checker: async () => {
          return {
            result: {
              checkPassed: false,
              checkTimeInMsecs: 1450,
            },
          }
        },
      },
    ])

    const response = await sendGet(buildClient('http://127.0.0.1:9080'), '/metrics')

    console.log(response.result.body)
    expect(response.result.statusCode).toBe(200)
    expect(response.result.body).toContain('test_healthcheck_1_availability 1')
    expect(response.result.body).toContain('test_healthcheck_1_latency_msecs 345')

    expect(response.result.body).toContain('test_healthcheck_2_availability 0')
    expect(response.result.body).toContain('test_healthcheck_2_latency_msecs 1450')
  })

  it('throws on invalid healthcheck name', async () => {
    await expect(
      initApp([
        {
          name: 'test healthcheck',
          // eslint-disable-next-line @typescript-eslint/require-await
          checker: async () => {
            return {
              result: {
                checkPassed: false,
                checkTimeInMsecs: 1450,
              },
            }
          },
        },
      ]),
    ).rejects.toThrow(/Invalid metric name/)
  })
})
