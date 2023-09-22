import type { Either } from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'

export type HealthChecker = (app: FastifyInstance) => Promise<Either<Error, true>>

/**
 * Return a function which executes healthcheck and throws an error if it fails
 */
export const wrapHealthCheck = (app: FastifyInstance, healthCheck: HealthChecker) => {
  return async () => {
    const response = await healthCheck(app)
    if (response.error) {
      throw response.error
    }
  }
}
