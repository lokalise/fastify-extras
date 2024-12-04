import { globalLogger } from '@lokalise/node-core'
import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { beforeEach, describe } from 'vitest'
import { createErrorHandler } from '../errors/errorHandler'
import { createStaticTokenAuthPreHandler } from './authPreHandlers'

const SECRET_TOKEN = 'my_secret'

describe('authPreHandlers', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await fastify()

    app.route({
      method: 'GET',
      url: '/',
      preHandler: createStaticTokenAuthPreHandler(SECRET_TOKEN, (_req) => globalLogger),
      handler: (_req: FastifyRequest, res: FastifyReply) => {
        res.status(200).send({
          data: 'ok',
        })
      },
    })

    // Using custom header name
    app.route({
      method: 'GET',
      url: '/developer',
      preHandler: createStaticTokenAuthPreHandler(
        SECRET_TOKEN,
        (_req) => globalLogger,
        'developer-token',
      ),
      handler: (_req: FastifyRequest, res: FastifyReply) => {
        res.status(200).send({
          data: 'ok',
        })
      },
    })

    //For showing 4xx errors in pre handler throws error (instead of 500).
    app.setErrorHandler(
      createErrorHandler({
        errorReporter: { report: () => {} },
      }),
    )

    await app.ready()
  })

  describe('default header name', () => {
    it('accepts request if secret token provided in request is valid', async () => {
      const response = await app
        .inject()
        .get('/')
        .headers({
          authorization: `Bearer ${SECRET_TOKEN}`,
        })
        .end()

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        data: 'ok',
      })
    })

    it('rejects with 401 if no token', async () => {
      const response = await app.inject().get('/').end()
      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({
        errorCode: 'AUTH_FAILED',
        message: 'Authentication failed',
      })
    })

    it('rejects with 401 if invalid token', async () => {
      const response = await app
        .inject()
        .get('/')
        .headers({
          authorization: 'bearer invalid_token',
        })
        .end()
      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({
        errorCode: 'AUTH_FAILED',
        message: 'Authentication failed',
      })
    })
  })

  describe('custom header name', () => {
    it('accepts request if token is valid', async () => {
      const response = await app
        .inject()
        .get('/developer')
        .headers({
          'developer-token': `Bearer ${SECRET_TOKEN}`,
        })
        .end()

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        data: 'ok',
      })
    })

    it('rejects with 401 if token is not provided', async () => {
      const response = await app
        .inject()
        .get('/developer')
        .headers({
          authorization: `Bearer ${SECRET_TOKEN}`, // Using default header name while custom one is specified
        })
        .end()

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({
        errorCode: 'AUTH_FAILED',
        message: 'Authentication failed',
      })
    })

    it('rejects with 401 if token is invalid', async () => {
      const response = await app
        .inject()
        .get('/developer')
        .headers({
          authorization: 'Bearer invalid-token',
        })
        .end()

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({
        errorCode: 'AUTH_FAILED',
        message: 'Authentication failed',
      })
    })
  })
})
