import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'
import type { RouteHandlerMethod } from 'fastify/types/route'

import type { RequireContextOptions } from './requestContextProviderPlugin'
import {
  getRequestIdFastifyAppConfig,
  requestContextProviderPlugin,
} from './requestContextProviderPlugin'

async function initApp(
  routeHandler: RouteHandlerMethod,
  pluginOptions?: RequireContextOptions,
  loggerEnabled: boolean = false,
) {
  const app = fastify({
    ...getRequestIdFastifyAppConfig(),
    logger: loggerEnabled,
  })
  await app.register(requestContextProviderPlugin, pluginOptions)

  app.route({
    method: 'GET',
    url: '/',
    handler: routeHandler,
  })
  await app.ready()
  return app
}

describe('requestContextProviderPlugin', () => {
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

  it('redacts sensitive data from logs', async () => {
    app = await initApp(
      (req, res) => {
        req.reqContext.logger.info({ password: 'sensitive' }, 'Dummy log message')
        return res.status(204).send()
      },
      {
        loggerOptions: {
          redact: {
            paths: ['password'],
          },
        },
      },
      true,
    )

    const response = await app.inject().get('/').end()
    expect(response.statusCode).toBe(204)
  })
})
