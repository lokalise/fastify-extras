import createError from '@fastify/error'
import fastifySSE from '@fastify/sse'
import type { ErrorReport } from '@lokalise/node-core'
import { InternalError, PublicNonRecoverableError } from '@lokalise/node-core'
import { type FastifyInstance, type RouteHandlerMethod, fastify } from 'fastify'
import { type ServerSentEvent, parseServerSentEvents } from 'parse-sse'
import { type MockInstance, afterAll, afterEach, describe, expect, it, vitest } from 'vitest'
import { type ZodSchema, z } from 'zod/v4'

import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { ErrorHandlerParams, FreeformRecord } from './errorHandler.js'
import { createErrorHandler, defaultResolveResponseObject } from './errorHandler.js'

async function initApp(
  routeHandler: RouteHandlerMethod,
  errorHandlerParams: Partial<ErrorHandlerParams> = {},
  awaitApp = true,
  routeSchema: ZodSchema = z.any(),
) {
  const app = fastify({
    logger: true,
  })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.setErrorHandler(
    createErrorHandler({
      errorReporter: {
        report: () => {},
      },
      ...errorHandlerParams,
    }),
  )

  app.route({
    method: 'GET',
    url: '/',
    schema: {
      params: routeSchema,
    },
    handler: routeHandler,
  })
  if (awaitApp) {
    await app.ready()
  }

  return app
}

describe('errorHandler', () => {
  let app: FastifyInstance
  afterAll(async () => {
    await app.close()
  })

  it('returns 500 internal error by default', async () => {
    app = await initApp(() => {
      throw new Error('Generic error')
    })

    const response = await app.inject().get('/').end()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    })
  })

  it('can override response resolution', async () => {
    app = await initApp(
      () => {
        throw new PublicNonRecoverableError({
          message: 'Auth failed',
          errorCode: 'AUTH_FAILED',
          httpStatusCode: 401,
          details: { someDetails: 'details' },
        })
      },
      {
        resolveResponseObject: (error: FreeformRecord) => {
          return {
            statusCode: 502,
            payload: {
              message: `${error.message}1`,
              errorCode: 'TEST_ERR',
              details: {
                someValues: 1,
              },
            },
          }
        },
      },
    )

    const response = await app.inject().get('/').end()

    expect(response.statusCode).toBe(502)
    expect(response.json()).toEqual({
      details: {
        someValues: 1,
      },
      errorCode: 'TEST_ERR',
      message: 'Auth failed1',
    })
  })

  it('applies headers returned by the response object resolver', async () => {
    app = await initApp(
      () => {
        throw new Error('Capacity exceeded')
      },
      {
        resolveResponseObject: () => {
          return {
            statusCode: 503,
            headers: { 'retry-after': '30' },
            payload: {
              message: 'Capacity exceeded',
              errorCode: 'PROVIDER_CAPACITY_EXCEEDED',
            },
          }
        },
      },
    )

    const response = await app.inject().get('/').end()

    expect(response.statusCode).toBe(503)
    expect(response.headers['retry-after']).toBe('30')
    expect(response.json()).toEqual({
      message: 'Capacity exceeded',
      errorCode: 'PROVIDER_CAPACITY_EXCEEDED',
    })
  })

  it('does not log or report non-5xx errors by default', async () => {
    const reports: ErrorReport[] = []
    let warnSpy: MockInstance | undefined
    let errorSpy: MockInstance | undefined

    app = await initApp(
      (req) => {
        warnSpy = vitest.spyOn(req.log, 'warn')
        errorSpy = vitest.spyOn(req.log, 'error')
        throw new PublicNonRecoverableError({
          message: 'Payload too large',
          errorCode: 'PAYLOAD_TOO_LARGE',
          httpStatusCode: 413,
        })
      },
      {
        errorReporter: {
          report: (report) => {
            reports.push(report)
          },
        },
      },
    )

    const response = await app.inject().get('/').end()

    expect(response.statusCode).toBe(413)
    expect(warnSpy!.mock.calls).toHaveLength(0)
    expect(errorSpy!.mock.calls).toHaveLength(0)
    expect(reports).toHaveLength(0)
  })

  it('can override logged object resolution', async () => {
    let logSpy: MockInstance | undefined
    app = await initApp(
      (req) => {
        logSpy = vitest.spyOn(req.log, 'error')
        throw new InternalError({
          message: 'Internal error',
          errorCode: 'INTERNAL',
        })
      },
      {
        resolveLogObject: (error: unknown) => {
          return {
            message: `${(error as Error).message}22`,
          }
        },
      },
    )

    const response = await app.inject().get('/').end()

    expect(response.statusCode).toBe(500)
    expect(logSpy!.mock.calls).toHaveLength(1)
    expect(logSpy!.mock.calls[0]).toEqual([
      {
        message: 'Internal error22',
      },
    ])
  })

  it('sends InternalError to the reporter', async () => {
    const logs: ErrorReport[] = []

    app = await initApp(
      () => {
        throw new InternalError({
          message: 'Internal error',
          errorCode: 'INTERNAL',
        })
      },
      {
        errorReporter: {
          report: (err) => {
            logs.push(err)
          },
        },
      },
    )

    const response = await app.inject().get('/').end()

    expect(response.statusCode).toBe(500)
    expect(logs).toHaveLength(1)
    const [logEntry] = logs
    expect(logEntry!.error).toMatchObject({
      message: 'Internal error',
      errorCode: 'INTERNAL',
    })
    expect(logEntry!.context).toMatchInlineSnapshot(`
      {
        "request": {
          "method": "GET",
          "params": {},
          "routerPath": "/",
          "url": "/",
        },
        "x-request-id": "req-1",
      }
    `)
  })
  it('sends generic error to the reporter', async () => {
    const logs: ErrorReport[] = []

    app = await initApp(
      () => {
        throw new Error('Something generic happened')
      },
      {
        errorReporter: {
          report: (err) => {
            logs.push(err)
          },
        },
      },
    )

    const response = await app.inject().get('/').end()

    expect(response.statusCode).toBe(500)
    expect(logs).toHaveLength(1)
    expect(logs[0]!.error).toMatchObject({
      message: 'Something generic happened',
      stack: expect.stringContaining('Something generic happened'),
    })
  })
  it('sends throwable to the reporter', async () => {
    const logs: ErrorReport[] = []

    app = await initApp(
      () => {
        throw {
          foo: 'Something happened',
        }
      },
      {
        errorReporter: {
          report: (err) => {
            logs.push(err)
          },
        },
      },
    )

    const response = await app.inject().get('/').end()

    expect(response.statusCode).toBe(500)
    expect(logs).toHaveLength(1)
    expect(logs[0]!.error).toMatchObject({
      message: 'Unhandled error',
    })
    expect(logs[0]!.context).toMatchObject({
      foo: 'Something happened',
    })
  })

  it('responds with AUTH_FAILED in case of internal auth failed error', async () => {
    app = await initApp(() => {
      throw new PublicNonRecoverableError({
        message: 'Auth failed',
        errorCode: 'AUTH_FAILED',
        httpStatusCode: 401,
        details: { someDetails: 'details' },
      })
    })

    const response = await app.inject().get('/').end()

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      message: 'Auth failed',
      errorCode: 'AUTH_FAILED',
      details: { someDetails: 'details' },
    })
  })

  it('responds with 400 for body parsing fastify error', async () => {
    app = await initApp(() => {}, undefined, false)

    app.route({
      method: 'POST',
      url: '/',
      handler: () => ({}),
    })

    await app.ready()

    const response = await app
      .inject()
      .post('/')
      .headers({
        'Content-Type': 'application/json',
      })
      .body('{"invalid}')
      .end()

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      message: "Body is not valid JSON but content-type is set to 'application/json'",
      errorCode: 'FST_ERR_CTP_INVALID_JSON_BODY',
    })
  })

  it('responds with 401 for standardized token error with invalid token', async () => {
    app = await initApp(() => {
      const err = new Error('Auth failed')
      // @ts-expect-error
      err.code = 'FST_JWT_AUTHORIZATION_TOKEN_INVALID'
      throw err
    })

    const response = await app.inject().get('/').end()

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      message: 'Authorization token is invalid',
      errorCode: 'AUTH_FAILED',
    })
  })

  it('responds with 401 for standardized token error with expired token', async () => {
    app = await initApp(() => {
      const err = new Error('Auth failed')
      // @ts-expect-error
      err.code = 'FST_JWT_NO_AUTHORIZATION_IN_HEADER'
      throw err
    })

    const response = await app.inject().get('/').end()

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      message: 'Auth failed',
      errorCode: 'AUTH_FAILED',
    })
  })

  it('returns 500 for InternalError', async () => {
    app = await initApp(() => {
      throw new InternalError({
        message: 'Auth failed',
        details: { userId: 4 },
        errorCode: 'INT_ERR',
      })
    })

    const response = await app.inject().get('/').end()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    })
  })

  it('returns 500 for internal Zod errors', async () => {
    app = await initApp(() => {
      z.string().parse(45)
    })

    const response = await app.inject().get('/').end()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toMatchInlineSnapshot(`
      {
        "errorCode": "INTERNAL_SERVER_ERROR",
        "message": "Internal server error",
      }
    `)
  })

  it('returns 400 for validation errors', async () => {
    app = await initApp(
      () => {
        z.string().parse(45)
      },
      {},
      true,
      z.object({
        name: z.string(),
      }),
    )

    const response = await app.inject().get('/').end()

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchInlineSnapshot(`
      {
        "details": {
          "error": [
            {
              "instancePath": "/name",
              "keyword": "invalid_type",
              "message": "Invalid input: expected string, received undefined",
              "params": {
                "expected": "string",
              },
              "schemaPath": "#/name/invalid_type",
            },
          ],
        },
        "errorCode": "VALIDATION_ERROR",
        "message": "Invalid params",
      }
    `)
  })
})

describe('errorHandler on SSE routes', () => {
  async function initSseApp(
    routeHandler: RouteHandlerMethod,
    errorHandlerParams: Partial<ErrorHandlerParams> = {},
  ) {
    const app = fastify({
      logger: true,
      forceCloseConnections: true,
    })
    await app.register(fastifySSE.default)

    app.setErrorHandler(
      createErrorHandler({
        errorReporter: {
          report: () => {},
        },
        ...errorHandlerParams,
      }),
    )

    app.route({
      method: 'GET',
      url: '/sse',
      sse: 'only',
      handler: routeHandler,
    })
    await app.listen({ port: 0, host: '127.0.0.1' })

    return app
  }

  let app: FastifyInstance
  afterEach(async () => {
    await app.close()
  })

  const sseRequest = () =>
    fetch(`${app.listeningOrigin}/sse`, {
      headers: { accept: 'text/event-stream' },
    })

  // resolves only once the server closes the stream, so it also guards against hanging connections
  const readSseEvents = async (response: Response) => {
    const events: ServerSentEvent[] = []
    for await (const event of parseServerSentEvents(response)) {
      events.push(event)
    }
    return events
  }

  it('sends the resolved error payload as a terminal SSE event on a live stream', async () => {
    const logs: ErrorReport[] = []
    app = await initSseApp(
      async (_, reply) => {
        await reply.sse.send({ event: 'start', data: 'started' })
        reply.sse.keepAlive()
        throw new InternalError({
          message: 'Internal error',
          errorCode: 'INTERNAL',
        })
      },
      {
        errorReporter: {
          report: (err) => {
            logs.push(err)
          },
        },
      },
    )

    const response = await sseRequest()
    const events = await readSseEvents(response)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(events).toEqual([
      expect.objectContaining({ type: 'start' }),
      expect.objectContaining({
        type: 'error',
        data: JSON.stringify({
          message: 'Internal server error',
          errorCode: 'INTERNAL_SERVER_ERROR',
        }),
      }),
    ])
    expect(logs).toEqual([
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'Internal error',
          errorCode: 'INTERNAL',
        }),
      }),
    ])
  })

  it('answers pre-stream errors on an SSE route as a regular error response', async () => {
    app = await initSseApp(() => {
      throw new Error('Generic error')
    })

    const response = await sseRequest()

    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    })
  })

  it('answers pre-stream errors on a keepAlive SSE route as a regular error response', async () => {
    app = await initSseApp((_, reply) => {
      // isConnected is already true here (set by the plugin before the handler ran) and keepAlive
      // prevents the plugin from closing the context on throw, so only headersSent tells the
      // error handler that no stream has actually started
      reply.sse.keepAlive()
      throw new Error('Generic error')
    })

    const response = await sseRequest()

    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    })
  })

  it('closes the stream without crashing when sending the terminal event fails', async () => {
    app = await initSseApp(async (_, reply) => {
      await reply.sse.send({ event: 'start', data: 'started' })
      reply.sse.keepAlive()
      // simulate the client being gone by the time the error handler sends the terminal event
      reply.sse.send = () => Promise.reject(new Error('client already gone'))
      throw new Error('Generic error')
    })

    const response = await sseRequest()
    const events = await readSseEvents(response)

    expect(response.status).toBe(200)
    expect(events).toEqual([expect.objectContaining({ type: 'start' })])
  })
})

describe('defaultResolveResponseObject', () => {
  it('maps PublicNonRecoverableError to its own status code and payload', () => {
    const error = new PublicNonRecoverableError({
      message: 'Conflicting state',
      errorCode: 'CONFLICT',
      httpStatusCode: 409,
      details: { entityId: '1' },
    })

    expect(defaultResolveResponseObject(error)).toEqual({
      statusCode: 409,
      payload: {
        message: 'Conflicting state',
        errorCode: 'CONFLICT',
        details: { entityId: '1' },
      },
    })
  })

  it('maps Zod schema validation errors to a 400 VALIDATION_ERROR', () => {
    const validation = [
      {
        [Symbol.for('ZodFastifySchemaValidationError')]: true,
        keyword: 'invalid_type',
        instancePath: '/name',
        schemaPath: '#/name/invalid_type',
        message: 'Invalid input: expected string, received undefined',
        params: { expected: 'string' },
      },
    ]
    const error = Object.assign(new Error('params validation failed'), { validation })

    expect(defaultResolveResponseObject(error)).toEqual({
      statusCode: 400,
      payload: {
        message: 'Invalid params',
        errorCode: 'VALIDATION_ERROR',
        details: { error: validation },
      },
    })
  })

  it('maps known auth error codes to a 401 AUTH_FAILED', () => {
    const error = Object.assign(new Error('Auth failed'), {
      code: 'FST_JWT_AUTHORIZATION_TOKEN_INVALID',
    })

    expect(defaultResolveResponseObject(error)).toEqual({
      statusCode: 401,
      payload: {
        message: 'Authorization token is invalid',
        errorCode: 'AUTH_FAILED',
      },
    })
  })

  it('maps 4xx FastifyErrors to their own status code and code', () => {
    const TeapotError = createError('ERR_TEAPOT', 'I am a teapot', 418)

    expect(defaultResolveResponseObject(new TeapotError())).toEqual({
      statusCode: 418,
      payload: {
        message: 'I am a teapot',
        errorCode: 'ERR_TEAPOT',
      },
    })
  })

  it('falls back to a 500 for unknown values', () => {
    expect(defaultResolveResponseObject({ foo: 'bar' })).toEqual({
      statusCode: 500,
      payload: {
        message: 'Internal server error',
        errorCode: 'INTERNAL_SERVER_ERROR',
      },
    })
  })
})
