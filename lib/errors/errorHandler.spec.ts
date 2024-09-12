import type { ErrorReport } from '@lokalise/node-core'
import { InternalError, PublicNonRecoverableError } from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'
import type { RouteHandlerMethod } from 'fastify/types/route'
import { type MockInstance, afterAll, describe, expect, it, vitest } from 'vitest'
import { z } from 'zod'

import type { ErrorHandlerParams, FreeformRecord } from './errorHandler'
import { createErrorHandler } from './errorHandler'

async function initApp(
  routeHandler: RouteHandlerMethod,
  errorHandlerParams: Partial<ErrorHandlerParams> = {},
  awaitApp = true,
) {
  const app = fastify({
    logger: true,
  })
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
    expect(logEntry.error).toMatchObject({
      message: 'Internal error',
      errorCode: 'INTERNAL',
    })
    expect(logEntry.context).toMatchInlineSnapshot(`
      {
        "request": {
          "params": {},
          "routerPath": "/",
          "url": "/",
          "x": "GET",
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
    expect(logs[0].error).toMatchObject({
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
    expect(logs[0].error).toMatchObject({
      message: 'Unhandled error',
    })
    expect(logs[0].context).toMatchObject({
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

  it('returns 400 for Zod errors', async () => {
    app = await initApp(() => {
      z.string().parse(45)
    })

    const response = await app.inject().get('/').end()

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      errorCode: 'VALIDATION_ERROR',
      message: 'Invalid params',
      details: {
        error: [
          {
            code: 'invalid_type',
            expected: 'string',
            message: 'Expected string, received number',
            path: [],
            received: 'number',
          },
        ],
      },
    })
  })
})
