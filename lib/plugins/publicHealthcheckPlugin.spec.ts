import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import type { HealthCheck, PublicHealthcheckPluginOptions } from './publicHealthcheckPlugin'
import { publicHealthcheckPlugin } from './publicHealthcheckPlugin'

const positiveHealthcheck: HealthCheck = () => {
  return Promise.resolve({ result: true })
}
const negativeHealthcheck: HealthCheck = () => {
  return Promise.resolve({ error: new Error('Something exploded') })
}

async function initApp(opts: PublicHealthcheckPluginOptions) {
  const app = fastify()
  await app.register(publicHealthcheckPlugin, opts)
  await app.ready()
  return app
}

describe('publicHealthcheckPlugin', () => {
  let app: FastifyInstance
  afterAll(async () => {
    await app.close()
  })

  it('returns a heartbeat', async () => {
    app = await initApp({ healthChecks: [] })

    const response = await app.inject().get('/').end()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ heartbeat: 'HEALTHY' })
  })

  it('returns custom heartbeat', async () => {
    app = await initApp({ responsePayload: { version: 1 }, healthChecks: [] })

    const response = await app.inject().get('/').end()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ heartbeat: 'HEALTHY', version: 1 })
  })

  it('returns false if one healthcheck fails', async () => {
    app = await initApp({
      responsePayload: { version: 1 },
      healthChecks: [negativeHealthcheck, positiveHealthcheck],
    })

    const response = await app.inject().get('/').end()
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ heartbeat: 'FAIL', version: 1 })
  })

  it('returns true if all healthchecks pass', async () => {
    app = await initApp({
      responsePayload: { version: 1 },
      healthChecks: [positiveHealthcheck, positiveHealthcheck],
    })

    const response = await app.inject().get('/').end()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ heartbeat: 'HEALTHY', version: 1 })
  })
})
