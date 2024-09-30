import type { CommonLogger, Either } from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'
import type { FastifyTypeProviderDefault } from 'fastify/types/type-provider'
import type {
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify/types/utils'

export type HealthChecker = (
  app: FastifyInstance<
    RawServerDefault,
    RawRequestDefaultExpression,
    RawReplyDefaultExpression,
    CommonLogger,
    FastifyTypeProviderDefault
  >,
) => Promise<Either<Error, true>>

/**
 * Return a function which executes healthcheck and throws an error if it fails
 */
export const wrapHealthCheck = (
  app: FastifyInstance<
    RawServerDefault,
    RawRequestDefaultExpression,
    RawReplyDefaultExpression,
    CommonLogger,
    FastifyTypeProviderDefault
  >,
  healthCheck: HealthChecker,
) => {
  return async () => {
    const response = await healthCheck(app)
    if (response.error) {
      throw response.error
    }
  }
}
