import { buildClient, sendGet, UNKNOWN_RESPONSE_SCHEMA } from '@lokalise/backend-http-client'
import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import { metricsPlugin } from './metricsPlugin'

async function initApp(errorObjectResolver = (err: unknown) => err) {
  const app = fastify()
  await app.register(metricsPlugin, {
    bindAddress: '0.0.0.0',
    loggerOptions: false,
    errorObjectResolver,
  })

  await app.ready()
  return app
}

describe('metricsPlugin', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await initApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('returns Prometheus metrics', async () => {
    const response = await sendGet(buildClient('http://127.0.0.1:9080'), '/metrics', {
      requestLabel: 'test',
      responseSchema: UNKNOWN_RESPONSE_SCHEMA,
    })

    expect(response.result.statusCode).toBe(200)
    expect(response.result.body).toEqual(expect.any(String))
  })

  it('handles an error', async () => {
    expect.assertions(2)
    let handledError
    try {
      await initApp((err) => {
        handledError = err
        return err
      })
    } catch (err) {
      expect(err).toMatchObject({
        message: 'Critical error when trying to launch metrics server',
      })
    }

    expect(handledError).toMatchObject({
      code: 'EADDRINUSE',
    })
  })
})
