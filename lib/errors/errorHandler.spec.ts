import createError from '@fastify/error'
import fastifySSE from '@fastify/sse'
import {
  ErrorType,
  InternalError as LokaliseInternalError,
  PublicError,
  definePublicError,
} from '@lokalise/errors'
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

const projectNotFoundErrorDefinition = definePublicError({
  code: 'PROJECT_NOT_FOUND',
  type: ErrorType.NOT_FOUND,
  detailsSchema: z.object({ projectId: z.string() }),
})
class ProjectNotFoundError extends PublicError.from(projectNotFoundErrorDefinition) {
  constructor(projectId: string) {
    super({ message: `Project ${projectId} not found`, details: { projectId } })
  }
}

const rateLimitErrorDefinition = definePublicError({
  code: 'RATE_LIMIT_EXCEEDED',
  type: ErrorType.RATE_LIMIT,
})
class RateLimitError extends PublicError.from(rateLimitErrorDefinition) {
  constructor() {
    super({ message: 'Too many requests' })
  }
}

const providerUnavailableErrorDefinition = definePublicError({
  code: 'PROVIDER_UNAVAILABLE',
  type: ErrorType.UNAVAILABLE,
  detailsSchema: z.object({ provider: z.string() }),
})
class ProviderUnavailableError extends PublicError.from(providerUnavailableErrorDefinition) {
  constructor(provider: string) {
    super({ message: `Provider ${provider} is unavailable`, details: { provider } })
  }
}

class DatabaseQueryError extends LokaliseInternalError.from('DATABASE_QUERY_ERROR')<{
  query: string
}> {
  constructor(query: string, cause?: unknown) {
    super({ message: 'Database query failed', details: { query }, cause })
  }
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
      code: 'INTERNAL_SERVER_ERROR',
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
              code: 'TEST_ERR',
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
      code: 'TEST_ERR',
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
              code: 'PROVIDER_CAPACITY_EXCEEDED',
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
      code: 'PROVIDER_CAPACITY_EXCEEDED',
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
      code: 'AUTH_FAILED',
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
      code: 'FST_ERR_CTP_INVALID_JSON_BODY',
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
      code: 'AUTH_FAILED',
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
      code: 'AUTH_FAILED',
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
      code: 'INTERNAL_SERVER_ERROR',
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    })
  })

  describe('@lokalise/errors', () => {
    it('responds with httpStatusCode and toPayload() for a PublicError with details', async () => {
      const reports: ErrorReport[] = []
      let errorSpy: MockInstance | undefined

      app = await initApp(
        (req) => {
          errorSpy = vitest.spyOn(req.log, 'error')
          throw new ProjectNotFoundError('abc')
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

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        message: 'Project abc not found',
        code: 'PROJECT_NOT_FOUND',
        errorCode: 'PROJECT_NOT_FOUND',
        details: { projectId: 'abc' },
      })
      expect(reports).toHaveLength(0)
      expect(errorSpy!.mock.calls).toHaveLength(0)
    })

    it('omits details from the payload for a PublicError without detailsSchema', async () => {
      app = await initApp(() => {
        throw new RateLimitError()
      })

      const response = await app.inject().get('/').end()

      expect(response.statusCode).toBe(429)
      expect(response.json()).toEqual({
        message: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        errorCode: 'RATE_LIMIT_EXCEEDED',
      })
      expect(response.json()).not.toHaveProperty('details')
    })

    it('reports and logs a PublicError that maps to a 5xx status', async () => {
      const reports: ErrorReport[] = []
      let errorSpy: MockInstance | undefined

      app = await initApp(
        (req) => {
          errorSpy = vitest.spyOn(req.log, 'error')
          throw new ProviderUnavailableError('deepl')
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

      expect(response.statusCode).toBe(503)
      expect(response.json()).toEqual({
        message: 'Provider deepl is unavailable',
        code: 'PROVIDER_UNAVAILABLE',
        errorCode: 'PROVIDER_UNAVAILABLE',
        details: { provider: 'deepl' },
      })

      expect(reports).toHaveLength(1)
      expect(reports[0]!.error).toBeInstanceOf(ProviderUnavailableError)

      expect(errorSpy!.mock.calls).toHaveLength(1)
      expect(errorSpy!.mock.calls[0]).toEqual([
        {
          msg: 'Provider deepl is unavailable',
          code: 'PROVIDER_UNAVAILABLE',
          details: '{"provider":"deepl"}',
          error: expect.objectContaining({
            type: 'ProviderUnavailableError',
            message: 'Provider deepl is unavailable',
            stack: expect.stringContaining('Provider deepl is unavailable'),
          }),
        },
      ])
    })

    it('masks an InternalError created with InternalError.from as a 500 and logs its code, details and cause', async () => {
      const reports: ErrorReport[] = []
      let errorSpy: MockInstance | undefined
      const cause = new Error('connection reset')

      app = await initApp(
        (req) => {
          errorSpy = vitest.spyOn(req.log, 'error')
          throw new DatabaseQueryError('SELECT 1', cause)
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

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({
        message: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
        errorCode: 'INTERNAL_SERVER_ERROR',
      })

      expect(reports).toHaveLength(1)
      expect(reports[0]!.error).toBeInstanceOf(DatabaseQueryError)

      expect(errorSpy!.mock.calls).toHaveLength(1)
      expect(errorSpy!.mock.calls[0]).toEqual([
        {
          msg: 'Database query failed',
          code: 'DATABASE_QUERY_ERROR',
          details: '{"query":"SELECT 1"}',
          error: expect.objectContaining({
            type: 'DatabaseQueryError',
            message: 'Database query failed',
            stack: expect.stringContaining('Database query failed'),
            cause: expect.objectContaining({
              type: 'Error',
              message: 'connection reset',
              stack: expect.stringContaining('connection reset'),
            }),
          }),
        },
      ])
    })

    it('masks an InternalError created with InternalError.create as a 500 and logs it without details', async () => {
      let errorSpy: MockInstance | undefined

      app = await initApp((req) => {
        errorSpy = vitest.spyOn(req.log, 'error')
        throw LokaliseInternalError.create({
          code: 'LQA_REVIEW_MISSING',
          message: 'LQA produced no review',
        })
      })

      const response = await app.inject().get('/').end()

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({
        message: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
        errorCode: 'INTERNAL_SERVER_ERROR',
      })

      expect(errorSpy!.mock.calls).toHaveLength(1)
      expect(errorSpy!.mock.calls[0]).toEqual([
        {
          msg: 'LQA produced no review',
          code: 'LQA_REVIEW_MISSING',
          details: undefined,
          error: expect.objectContaining({
            message: 'LQA produced no review',
          }),
        },
      ])
      expect(errorSpy!.mock.calls[0]![0].error).not.toHaveProperty('cause')
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
        "code": "INTERNAL_SERVER_ERROR",
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
        "code": "VALIDATION_ERROR",
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
          code: 'INTERNAL_SERVER_ERROR',
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
      code: 'INTERNAL_SERVER_ERROR',
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
      code: 'INTERNAL_SERVER_ERROR',
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
        code: 'CONFLICT',
        errorCode: 'CONFLICT',
        details: { entityId: '1' },
      },
    })
  })

  it('maps a @lokalise/errors PublicError to httpStatusCode and toPayload()', () => {
    const conflictErrorDefinition = definePublicError({
      code: 'PROJECT_ALREADY_EXISTS',
      type: ErrorType.CONFLICT,
      detailsSchema: z.object({ projectId: z.string() }),
    })
    const ConflictError = PublicError.from(conflictErrorDefinition)
    const error = new ConflictError({
      message: 'Project already exists',
      details: { projectId: '1' },
    })

    expect(defaultResolveResponseObject(error)).toEqual({
      statusCode: 409,
      payload: {
        message: 'Project already exists',
        code: 'PROJECT_ALREADY_EXISTS',
        errorCode: 'PROJECT_ALREADY_EXISTS',
        details: { projectId: '1' },
      },
    })
  })

  it('masks a @lokalise/errors InternalError as a generic 500', () => {
    const error = LokaliseInternalError.create({
      code: 'DATABASE_QUERY_ERROR',
      message: 'Database query failed',
      details: { query: 'SELECT 1' },
    })

    expect(defaultResolveResponseObject(error)).toEqual({
      statusCode: 500,
      payload: {
        message: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
        errorCode: 'INTERNAL_SERVER_ERROR',
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
        code: 'VALIDATION_ERROR',
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
        code: 'AUTH_FAILED',
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
        code: 'ERR_TEAPOT',
        errorCode: 'ERR_TEAPOT',
      },
    })
  })

  it('falls back to a 500 for unknown values', () => {
    expect(defaultResolveResponseObject({ foo: 'bar' })).toEqual({
      statusCode: 500,
      payload: {
        message: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
        errorCode: 'INTERNAL_SERVER_ERROR',
      },
    })
  })
})
