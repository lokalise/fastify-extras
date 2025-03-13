import type { Either } from '@lokalise/node-core'
import type { AnyFastifyInstance } from '../pluginsCommon.js'

export type HealthChecker = (app: AnyFastifyInstance) => Promise<Either<Error, true>>

/**
 * Return a function which executes healthcheck and throws an error if it fails
 */
export const wrapHealthCheck = (app: AnyFastifyInstance, healthCheck: HealthChecker) => {
  return async () => {
    const response = await healthCheck(app)
    if (response.error) {
      throw response.error
    }
  }
}
