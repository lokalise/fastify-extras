import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import type { HealthChecker } from './healthcheckCommons.js'
import type { PublicHealthcheckPluginOptions } from './publicHealthcheckPlugin.js'
import { publicHealthcheckPlugin } from './publicHealthcheckPlugin.js'

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
    expect(response.json()).toEqual({ heartbeat: 'HEALTHY', checks: {} })
  })

  it('returns a heartbeat on a custom endpoint', async () => {
    app = await initApp({ healthChecks: [], url: '/' })

    const response = await app.inject().get('/').end()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ heartbeat: 'HEALTHY', checks: {} })
  })

  it('returns custom heartbeat', async () => {
    app = await initApp({ responsePayload: { version: 1 }, healthChecks: [] })

    const response = await app.inject().get('/health').end()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      heartbeat: 'HEALTHY',
      version: 1,
      checks: {},
    })
  })

  it('returns false if one mandatory healthcheck fails', async () => {
    app = await initApp({
      responsePayload: { version: 1 },
      healthChecks: [
        {
          name: 'check1',
          isMandatory: true,
          checker: negativeHealthcheckChecker,
        },
        {
          name: 'check2',
          isMandatory: true,
          checker: positiveHealthcheckChecker,
        },
      ],
    })

    const response = await app.inject().get('/health').end()
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      heartbeat: 'FAIL',
      version: 1,
      checks: {
        check1: 'FAIL',
        check2: 'HEALTHY',
      },
    })
  })

  it('returns partial if optional healthcheck fails', async () => {
    app = await initApp({
      responsePayload: { version: 1 },
      healthChecks: [
        {
          name: 'check1',
          isMandatory: false,
          checker: negativeHealthcheckChecker,
        },
        {
          name: 'check2',
          isMandatory: true,
          checker: positiveHealthcheckChecker,
        },
      ],
    })

    const response = await app.inject().get('/health').end()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      heartbeat: 'PARTIALLY_HEALTHY',
      version: 1,
      checks: {
        check1: 'FAIL',
        check2: 'HEALTHY',
      },
    })
  })

  it('returns true if all healthchecks pass', async () => {
    app = await initApp({
      responsePayload: { version: 1 },
      healthChecks: [
        {
          name: 'check1',
          isMandatory: true,
          checker: positiveHealthcheckChecker,
        },
        {
          name: 'check2',
          isMandatory: true,
          checker: positiveHealthcheckChecker,
        },
      ],
    })

    const response = await app.inject().get('/health').end()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      heartbeat: 'HEALTHY',
      version: 1,
      checks: {
        check1: 'HEALTHY',
        check2: 'HEALTHY',
      },
    })
  })

  it('returns extra info if data provider is set', async () => {
    app = await initApp({
      responsePayload: { version: 1 },
      healthChecks: [
        {
          name: 'check1',
          isMandatory: true,
          checker: positiveHealthcheckChecker,
        },
      ],
      infoProviders: [
        {
          name: 'provider1',
          dataResolver: () => {
            return {
              someData: 1,
            }
          },
        },
      ],
    })

    const response = await app.inject().get('/health').end()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      heartbeat: 'HEALTHY',
      version: 1,
      checks: {
        check1: 'HEALTHY',
      },
      extraInfo: [
        {
          name: 'provider1',
          value: {
            someData: 1,
          },
        },
      ],
    })
  })
})
