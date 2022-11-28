import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'
import type { RouteHandlerMethod } from 'fastify/types/route'

import {
  getRequestIdFastifyAppConfig,
  requestContextProviderPlugin,
} from './requestContextProviderPlugin'

async function initApp(routeHandler: RouteHandlerMethod) {
  const app = fastify({
    ...getRequestIdFastifyAppConfig(),
  })
  await app.register(requestContextProviderPlugin)

  app.route({
    method: 'GET',
    url: '/',
    handler: routeHandler,
  })
  await app.ready()
  return app
}

describe('errorHandler', () => {
  let app: FastifyInstance
  afterAll(async () => {
    await app.close()
  })

  it('sets reqId on request and response', async () => {
    expect.assertions(3)

    let reqId = 'invalid'
    app = await initApp((req, res) => {
      expect(req.reqContext.reqId).toEqual(expect.any(String))
      reqId = req.reqContext.reqId
      return res.status(204).send()
    })

    const response = await app.inject().get('/').end()
    expect(response.statusCode).toBe(204)
    expect(response.headers['x-request-id']).toBe(reqId)
  })

  it('sets logger', async () => {
    expect.assertions(2)

    app = await initApp((req, res) => {
      expect(req.reqContext.logger).toBeDefined()
      req.reqContext.logger.info('Dummy log message')
      return res.status(204).send()
    })

    const response = await app.inject().get('/').end()
    expect(response.statusCode).toBe(204)
  })
})
