import { FastifyError } from '@fastify/error'
import type { SSEReplyInterface } from '@fastify/sse'
import type { ErrorReporter } from '@lokalise/node-core'
import {
  isError,
  isInternalError,
  isObject,
  isPublicNonRecoverableError,
  isStandardizedError,
} from '@lokalise/node-core'
import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod'
import pino from 'pino'
import type { ZodError } from 'zod/v4'
import type { AnyFastifyInstance } from '../plugins/pluginsCommon.js'

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type FreeformRecord = Record<string, any>

const knownAuthErrors = new Set([
  'FST_JWT_NO_AUTHORIZATION_IN_HEADER',
  'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED',
  'FST_JWT_AUTHORIZATION_TOKEN_INVALID',
])

export type ErrorResponseObject = {
  statusCode: number
  headers?: Record<string, string>
  payload: {
    message: string
    errorCode: string
    details?: FreeformRecord
  }
}

export function isZodError(value: unknown): value is ZodError {
  return (value as ZodError).name === 'ZodError'
}

function resolveLogObject(error: unknown): FreeformRecord {
  if (isInternalError(error)) {
    return {
      msg: error.message,
      code: error.errorCode,
      details: error.details ? JSON.stringify(error.details) : undefined,
      error: pino.stdSerializers.err({
        name: error.name,
        message: error.message,
        stack: error.stack,
      }),
    }
  }

  return {
    message: isObject(error) ? error.message : JSON.stringify(error),
    error: isError(error) ? pino.stdSerializers.err(error) : error,
  }
}

export function defaultResolveResponseObject(error: FreeformRecord): ErrorResponseObject {
  if (isPublicNonRecoverableError(error)) {
    return {
      statusCode: error.httpStatusCode ?? 500,
      payload: {
        message: error.message,
        errorCode: error.errorCode,
        details: error.details,
      },
    }
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    return {
      statusCode: 400,
      payload: {
        message: 'Invalid params',
        errorCode: 'VALIDATION_ERROR',
        details: {
          error: error.validation,
        },
      },
    }
  }

  if (isResponseSerializationError(error)) {
    return {
      statusCode: 500,
      payload: {
        message: 'Invalid response',
        errorCode: 'RESPONSE_VALIDATION_ERROR',
        details: {
          error: error.cause.issues,
          method: error.method,
          url: error.url,
        },
      },
    }
  }

  if (isStandardizedError(error)) {
    if (knownAuthErrors.has(error.code)) {
      const message =
        error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID'
          ? 'Authorization token is invalid'
          : error.message

      return {
        statusCode: 401,
        payload: {
          message,
          errorCode: 'AUTH_FAILED',
        },
      }
    }
  }

  if (error instanceof FastifyError) {
    if (error.statusCode === undefined || error.statusCode >= 500) {
      return {
        statusCode: error.statusCode ?? 500,
        payload: {
          message: 'Internal server error',
          errorCode: 'INTERNAL_SERVER_ERROR',
        },
      }
    }

    return {
      statusCode: error.statusCode,
      payload: {
        message: error.message,
        errorCode: error.code,
      },
    }
  }

  return {
    statusCode: 500,
    payload: {
      message: 'Internal server error',
      errorCode: 'INTERNAL_SERVER_ERROR',
    },
  }
}

export type ErrorHandlerParams = {
  errorReporter: ErrorReporter
  resolveResponseObject?: (error: FreeformRecord) => ErrorResponseObject | undefined
  resolveLogObject?: (error: unknown) => FreeformRecord | undefined
}

export function createErrorHandler(
  params: ErrorHandlerParams,
): (
  this: AnyFastifyInstance,
  error: FreeformRecord,
  request: FastifyRequest,
  reply: FastifyReply,
) => void {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This fn is quite readable
  return async function errorHandler(
    this: AnyFastifyInstance,
    error: FreeformRecord,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const responseObject =
      params.resolveResponseObject?.(error) ?? defaultResolveResponseObject(error)

    if (responseObject.statusCode >= 500) {
      params.errorReporter.report({
        error: isError(error) ? error : new Error('Unhandled error'),
        context: {
          request: {
            url: request.url,
            params: request.params,
            method: request.method,
            routerPath: request.routeOptions.url,
          },
          'x-request-id': request.id,
          // If error is not an instance of Error, include its properties in the context for additional information.
          // Error details are included in the 'error' property above, so duplicating them in the context is unnecessary.
          ...(!isError(error) ? error : {}),
        },
      })

      const logObject = params.resolveLogObject?.(error) ?? resolveLogObject(error)

      // Potentially, request can break before we resolved the context
      const reqLogger = request.reqContext?.logger ?? request.log

      reqLogger.error(logObject)
    }

    // reply.sse is only decorated when the app registers @fastify/sse
    const sse: SSEReplyInterface | undefined = reply.sse

    // headersSent distinguishes an actually started SSE stream
    if (sse?.isConnected && reply.raw.headersSent) {
      try {
        await sse.send({ event: 'error', data: responseObject.payload })
      } catch (err) {
        // Potentially, request can break before we resolved the context
        const reqLogger = request.reqContext?.logger ?? request.log

        reqLogger.error(err, 'Failed to send SSE error')
      } finally {
        sse.close()
      }

      return
    }

    void reply
      .headers(responseObject.headers ?? {})
      .status(responseObject.statusCode)
      .send(responseObject.payload)
  }
}
