import type { FastifyInstance } from 'fastify'
import { type RouteHandlerMethod, fastify } from 'fastify'

import pino from 'pino'
import type { RequestContext } from '../index.ts'
import {
  getRequestIdFastifyAppConfig,
  requestContextProviderPlugin,
} from './requestContextProviderPlugin.js'

type TestApp = FastifyInstance<any, any, any, pino.Logger, any>

const initApp = async (routeHandler: RouteHandlerMethod): Promise<TestApp> => {
  const app = fastify({
    ...getRequestIdFastifyAppConfig(),
    loggerInstance: pino(),
  })
  await app.register(requestContextProviderPlugin)

  app.route({
    method: 'POST',
    url: '/',
    handler: routeHandler,
  })
  app.route({
    method: 'GET',
    url: '/:userId',
    handler: routeHandler,
  })

  await app.ready()
  return app
}

const getLoggerBindings = (requestContext: RequestContext): any =>
  (requestContext.logger as pino.Logger).bindings()

describe('requestContextProviderPlugin', () => {
  let app: TestApp

  afterEach(async () => {
    await app.close()
  })

  describe('reqId', () => {
    it('sets reqId on request and response', async () => {
      expect.assertions(3)

      let reqId = 'invalid'
      app = await initApp((req, res) => {
        expect(req.reqContext.reqId).toEqual(expect.any(String))
        reqId = req.reqContext.reqId
        return res.status(204).send()
      })

      const response = await app.inject().post('/').end()
      expect(response.statusCode).toBe(204)
      expect(response.headers['x-request-id']).toBe(reqId)
    })
  })

  describe('logger', () => {
    it('sets logger', async () => {
      expect.assertions(2)

      app = await initApp((req, res) => {
        expect(req.reqContext.logger).toBeDefined()
        return res.status(204).send()
      })

      const response = await app.inject().post('/').end()
      expect(response.statusCode).toBe(204)
    })

    it('should contain reqId', async () => {
      expect.assertions(7)

      app = await initApp((req, res) => {
        expect(req.reqContext.logger).toBeDefined()

        const loggerBindings = getLoggerBindings(req.reqContext)
        expect(loggerBindings).toBeDefined()
        expect(loggerBindings.reqId).toBeDefined()
        expect(loggerBindings['x-request-id']).toBeDefined()

        expect(loggerBindings.reqId).toBe(loggerBindings['x-request-id'])
        expect(loggerBindings.reqId).toBe(req.reqContext.reqId)

        return res.status(204).send()
      })

      const response = await app.inject().post('/').end()
      expect(response.statusCode).toBe(204)
    })

    it('creates logger child with api endpoint props without path params', async () => {
      expect.assertions(4)

      app = await initApp((req, res) => {
        expect(req.reqContext.logger).toBeDefined()

        const loggerBindings = getLoggerBindings(req.reqContext)
        expect(loggerBindings).toBeDefined()
        expect(loggerBindings).toEqual({
          reqId: req.reqContext.reqId,
          'x-request-id': req.reqContext.reqId,
          'api-endpoint': '/',
          'api-method': 'POST',
        })

        return res.status(204).send()
      })

      const response = await app.inject().post('/').end()
      expect(response.statusCode).toBe(204)
    })

    it('creates logger child with api endpoint props with path params', async () => {
      expect.assertions(4)

      app = await initApp((req, res) => {
        expect(req.reqContext.logger).toBeDefined()

        const loggerBindings = getLoggerBindings(req.reqContext)
        expect(loggerBindings).toBeDefined()
        expect(loggerBindings).toEqual({
          reqId: req.reqContext.reqId,
          'x-request-id': req.reqContext.reqId,
          'api-endpoint': '/:userId',
          'api-method': 'GET',
          'api-endpoint-param-userId': '123',
        })

        return res.status(204).send()
      })

      const response = await app.inject().get('/123').end()
      expect(response.statusCode).toBe(204)
    })
  })
})
