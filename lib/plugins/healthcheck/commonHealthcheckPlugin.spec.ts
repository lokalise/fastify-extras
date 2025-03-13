import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import { describe } from 'vitest'
import {
  type CommonHealthcheckPluginOptions,
  commonHealthcheckPlugin,
} from './commonHealthcheckPlugin.js'
import type { HealthChecker } from './healthcheckCommons.js'

const positiveHealthcheckChecker: HealthChecker = () => {
  return Promise.resolve({ result: true })
}
const negativeHealthcheckChecker: HealthChecker = () => {
  return Promise.resolve({ error: new Error('Something exploded') })
}

async function initApp(opts: CommonHealthcheckPluginOptions) {
  const app = fastify()
  await app.register(commonHealthcheckPlugin, opts)
  await app.ready()
  return app
}

const PUBLIC_ENDPOINT = '/'
const PRIVATE_ENDPOINT = '/health'

describe('commonHealthcheckPlugin', () => {
  let app: FastifyInstance
  afterAll(async () => {
    await app.close()
  })

  describe('public endpoint', () => {
    it('returns a heartbeat', async () => {
      app = await initApp({ healthChecks: [] })

      const response = await app.inject().get(PUBLIC_ENDPOINT).end()
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ heartbeat: 'HEALTHY' })
    })

    it('returns 404 if healthcheck on root route is not enabled', async () => {
      app = await initApp({ healthChecks: [], isRootRouteEnabled: false })

      const response = await app.inject().get(PUBLIC_ENDPOINT).end()
      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        error: 'Not Found',
        message: 'Route GET:/ not found',
        statusCode: 404,
      })
    })

    it('returns custom heartbeat', async () => {
      app = await initApp({ responsePayload: { version: 1 }, healthChecks: [] })

      const response = await app.inject().get(PUBLIC_ENDPOINT).end()
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        heartbeat: 'HEALTHY',
        version: 1,
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

      const response = await app.inject().get(PUBLIC_ENDPOINT).end()
      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({
        heartbeat: 'FAIL',
        version: 1,
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

      const response = await app.inject().get(PUBLIC_ENDPOINT).end()
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        heartbeat: 'PARTIALLY_HEALTHY',
        version: 1,
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

      const response = await app.inject().get(PUBLIC_ENDPOINT).end()
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        heartbeat: 'HEALTHY',
        version: 1,
      })
    })

    it('omits extra info if data provider is set', async () => {
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

      const response = await app.inject().get(PUBLIC_ENDPOINT).end()
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        heartbeat: 'HEALTHY',
        version: 1,
      })
    })
  })

  describe('private endpoint', () => {
    it('returns a heartbeat', async () => {
      app = await initApp({ healthChecks: [] })

      const response = await app.inject().get(PRIVATE_ENDPOINT).end()
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ heartbeat: 'HEALTHY', checks: {} })
    })

    it('returns custom heartbeat', async () => {
      app = await initApp({ responsePayload: { version: 1 }, healthChecks: [] })

      const response = await app.inject().get(PRIVATE_ENDPOINT).end()
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

      const response = await app.inject().get(PRIVATE_ENDPOINT).end()
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

      const response = await app.inject().get(PRIVATE_ENDPOINT).end()
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

      const response = await app.inject().get(PRIVATE_ENDPOINT).end()
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

      const response = await app.inject().get(PRIVATE_ENDPOINT).end()
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
})
