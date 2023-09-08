import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import type { HealthChecker, PublicHealthcheckPluginOptions } from './publicHealthcheckPlugin'
import { publicHealthcheckPlugin } from './publicHealthcheckPlugin'

const positiveHealthcheckChecker: HealthChecker = () => {
  return Promise.resolve({ result: true })
}
const negativeHealthcheckChecker: HealthChecker = () => {
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

    const response = await app.inject().get('/health').end()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ heartbeat: 'HEALTHY' })
  })

  it('returns a heartbeat on a custom endpoint', async () => {
    app = await initApp({ healthChecks: [], url: '/' })

    const response = await app.inject().get('/').end()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ heartbeat: 'HEALTHY' })
  })

  it('returns custom heartbeat', async () => {
    app = await initApp({ responsePayload: { version: 1 }, healthChecks: [] })

    const response = await app.inject().get('/health').end()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ heartbeat: 'HEALTHY', version: 1 })
  })

  it('returns false if one mandatory healthcheck fails', async () => {
    app = await initApp({
      responsePayload: { version: 1 },
      healthChecks: [
        {
          isMandatory: true,
          checker: negativeHealthcheckChecker,
        },
        {
          isMandatory: true,
          checker: positiveHealthcheckChecker,
        },
      ],
    })

    const response = await app.inject().get('/health').end()
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ heartbeat: 'FAIL', version: 1 })
  })

  it('returns partial if optional healthcheck fails', async () => {
    app = await initApp({
      responsePayload: { version: 1 },
      healthChecks: [
        {
          isMandatory: false,
          checker: negativeHealthcheckChecker,
        },
        {
          isMandatory: true,
          checker: positiveHealthcheckChecker,
        },
      ],
    })

    const response = await app.inject().get('/health').end()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ heartbeat: 'PARTIALLY_HEALTHY', version: 1 })
  })

  it('returns true if all healthchecks pass', async () => {
    app = await initApp({
      responsePayload: { version: 1 },
      healthChecks: [
        {
          isMandatory: true,
          checker: positiveHealthcheckChecker,
        },
        {
          isMandatory: true,
          checker: positiveHealthcheckChecker,
        },
      ],
    })

    const response = await app.inject().get('/health').end()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ heartbeat: 'HEALTHY', version: 1 })
  })
})
