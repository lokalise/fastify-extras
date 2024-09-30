import type { ErrorReporter } from '@lokalise/node-core'
import {
  isError,
  isInternalError,
  isObject,
  isPublicNonRecoverableError,
  isStandardizedError,
} from '@lokalise/node-core'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod'
import pino from 'pino'
import type { ZodError } from 'zod'

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type FreeformRecord = Record<string, any>

const knownAuthErrors = new Set([
  'FST_JWT_NO_AUTHORIZATION_IN_HEADER',
  'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED',
  'FST_JWT_AUTHORIZATION_TOKEN_INVALID',
])

type ErrorResponseObject = {
  statusCode: number
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

function resolveResponseObject(error: FreeformRecord): ErrorResponseObject {
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

export function createErrorHandler(params: ErrorHandlerParams) {
  return function errorHandler(
    this: FastifyInstance,
    error: FreeformRecord,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    const logObject = params.resolveLogObject?.(error) ?? resolveLogObject(error)

    const responseObject = params.resolveResponseObject?.(error) ?? resolveResponseObject(error)
    if (responseObject.statusCode >= 500) {
      params.errorReporter.report({
        error: isError(error) ? error : new Error('Unhandled error'),
        context: {
          request: {
            url: request.url,
            params: request.params,
            x: request.method,
            routerPath: request.routeOptions.url,
          },
          'x-request-id': request.id,
          // If error is not an instance of Error, include its properties in the context for additional information.
          // Error details are included in the 'error' property above, so duplicating them in the context is unnecessary.
          ...(!isError(error) ? error : {}),
        },
      })

      // Potentially request can break before we resolved the context
      if (request.reqContext) {
        // this preserves correct request id field
        request.reqContext.logger.error(logObject)
      } else {
        request.log.error(logObject)
      }
    }

    void reply.status(responseObject.statusCode).send(responseObject.payload)
  }
}
