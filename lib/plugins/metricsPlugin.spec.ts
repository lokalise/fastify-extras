import { sendGet } from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import { metricsPlugin } from './metricsPlugin'

async function initApp() {
  const app = fastify()
  await app.register(metricsPlugin, {
    bindAddress: '0.0.0.0',
    loggerOptions: false,
    errorObjectResolver: (err) => err,
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
    const response = await sendGet('http://127.0.0.1:9080', '/metrics')

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual(expect.any(String))
  })
})
