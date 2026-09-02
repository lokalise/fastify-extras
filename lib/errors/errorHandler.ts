import { FastifyError } from '@fastify/error'
import type { SSEReplyInterface } from '@fastify/sse'
import { InternalError, PublicError } from '@lokalise/errors'
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
    code: string
    /**
     * @deprecated Compatibility alias of `code`, matching the `@lokalise/node-core` payload shape. The built-in
     * mapping keeps emitting it alongside `code`; it will be dropped in a future major version.
     */
    errorCode?: string
    details?: FreeformRecord
  }
}

// Shared by reference across responses, so it is frozen: a consumer wrapper that mutates the returned
// payload would otherwise leak that mutation into every later 500 in the process.
const INTERNAL_SERVER_ERROR_PAYLOAD: ErrorResponseObject['payload'] = Object.freeze({
  message: 'Internal server error',
  code: 'INTERNAL_SERVER_ERROR',
  errorCode: 'INTERNAL_SERVER_ERROR',
})

export function isZodError(value: unknown): value is ZodError {
  return (value as ZodError).name === 'ZodError'
}

function resolveLogObject(error: unknown): FreeformRecord {
  // Checked before node-core's isInternalError, which also matches on `error.name === 'InternalError'` and would
  // claim a consumer class of that name extending the @lokalise/errors base, dropping the `cause` chain.
  if (InternalError.isInstance(error) || PublicError.isInstance(error)) {
    // `details` is not repeated at the top level: errWithCause already includes it (and `code`) as own
    // enumerable properties, and pino's serializer copes with circular or BigInt details where JSON.stringify throws.
    return {
      msg: error.message,
      code: error.code,
      error: pino.stdSerializers.errWithCause(error),
    }
  }

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
  if (InternalError.isInstance(error)) {
    return {
      statusCode: 500,
      payload: INTERNAL_SERVER_ERROR_PAYLOAD,
    }
  }

  if (PublicError.isInstance(error)) {
    return {
      statusCode: error.httpStatusCode,
      payload: error.toPayload(),
    }
  }

  if (isPublicNonRecoverableError(error)) {
    return {
      statusCode: error.httpStatusCode ?? 500,
      payload: {
        message: error.message,
        code: error.errorCode,
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
        code: 'VALIDATION_ERROR',
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
        code: 'RESPONSE_VALIDATION_ERROR',
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
          code: 'AUTH_FAILED',
          errorCode: 'AUTH_FAILED',
        },
      }
    }
  }

  if (error instanceof FastifyError) {
    return resolveFastifyErrorResponseObject(error)
  }

  return {
    statusCode: 500,
    payload: INTERNAL_SERVER_ERROR_PAYLOAD,
  }
}

function resolveFastifyErrorResponseObject(error: FastifyError): ErrorResponseObject {
  if (error.statusCode === undefined || error.statusCode >= 500) {
    return {
      statusCode: error.statusCode ?? 500,
      payload: INTERNAL_SERVER_ERROR_PAYLOAD,
    }
  }

  return {
    statusCode: error.statusCode,
    payload: {
      message: error.message,
      code: error.code,
      errorCode: error.code,
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
