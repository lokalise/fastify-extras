import type { Either } from '@lokalise/node-core'
import type { FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'
import type { AnyFastifyInstance } from '../pluginsCommon'
import type { HealthChecker } from './healthcheckCommons'

export interface CommonHealthcheckPluginOptions {
  responsePayload?: Record<string, unknown>
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  healthChecks: readonly HealthCheck[]
  infoProviders?: readonly InfoProvider[]
}

type HealthcheckRouteOptions = {
  url: string
  useHealthcheckAggregations: boolean
}

type HealthcheckResult = {
  name: string
  isMandatory: boolean
  result: Either<Error, true>
}

type ResolvedHealthcheckResponse = {
  isFullyHealthy: boolean
  isPartiallyHealthy: boolean
  healthChecks: Record<string, string>
}

export type InfoProvider = {
  name: string
  dataResolver: () => Record<string, unknown>
}

export type HealthCheck = {
  name: string
  isMandatory: boolean
  checker: HealthChecker
}

function resolveHealthcheckResults(
  results: HealthcheckResult[],
  opts: CommonHealthcheckPluginOptions,
  routeOpts: HealthcheckRouteOptions,
): ResolvedHealthcheckResponse {
  const healthChecks: Record<string, string> = {}

  if (routeOpts.useHealthcheckAggregations) {
    // Use aggregation to determine the overall health of the service
    // Omit separate healthcheck results from the response
    const isFullyHealthy = results.every((entry) => !entry.result.error)
    const isPartiallyHealthy = results.every((entry) => !entry.result.error || !entry.isMandatory)
    healthChecks.aggregation = isFullyHealthy
      ? 'HEALTHY'
      : isPartiallyHealthy
        ? 'PARTIALLY_HEALTHY'
        : 'FAIL'

    return {
      isFullyHealthy,
      isPartiallyHealthy,
      healthChecks,
    }
  }

  let isFullyHealthy = true
  let isPartiallyHealthy = false

  // Return detailed healthcheck results
  for (let i = 0; i < results.length; i++) {
    const entry = results[i]
    healthChecks[entry.name] = entry.result.error ? 'FAIL' : 'HEALTHY'
    if (entry.result.error && opts.healthChecks[i].isMandatory) {
      isFullyHealthy = false
      isPartiallyHealthy = false
    }

    // Check if we are only partially healthy (only optional dependencies are failing)
    if (isFullyHealthy && entry.result.error && !opts.healthChecks[i].isMandatory) {
      isFullyHealthy = false
      isPartiallyHealthy = true
    }
  }

  return {
    isFullyHealthy,
    isPartiallyHealthy,
    healthChecks,
  }
}

function addRoute(
  app: AnyFastifyInstance,
  opts: CommonHealthcheckPluginOptions,
  routeOpts: HealthcheckRouteOptions,
): void {
  const responsePayload = opts.responsePayload ?? {}

  app.route({
    url: routeOpts.url,
    method: 'GET',
    logLevel: opts.logLevel ?? 'info',
    schema: {
      // hide route from swagger plugins
      // @ts-expect-error
      hide: true,
    },

    handler: async (_, reply) => {
      let isFullyHealthy = true
      let isPartiallyHealthy = false
      let healthChecks: Record<string, string> = {}

      if (opts.healthChecks.length) {
        const results = await Promise.all(
          opts.healthChecks.map(async (healthcheck) => {
            const result = await healthcheck.checker(app)
            if (result.error) {
              app.log.error(result.error, `${healthcheck.name} healthcheck has failed`)
            }
            return {
              name: healthcheck.name,
              result,
              isMandatory: healthcheck.isMandatory,
            }
          }),
        )

        const resolvedHealthcheckResponse = resolveHealthcheckResults(results, opts, routeOpts)
        healthChecks = resolvedHealthcheckResponse.healthChecks
        isFullyHealthy = resolvedHealthcheckResponse.isFullyHealthy
        isPartiallyHealthy = resolvedHealthcheckResponse.isPartiallyHealthy
      }

      const extraInfo =
        opts.infoProviders && !routeOpts.useHealthcheckAggregations
          ? opts.infoProviders.map((infoProvider) => {
              return {
                name: infoProvider.name,
                value: infoProvider.dataResolver(),
              }
            })
          : undefined

      return reply.status(isFullyHealthy || isPartiallyHealthy ? 200 : 500).send({
        ...responsePayload,
        checks: healthChecks,
        ...(extraInfo && { extraInfo }),
        heartbeat: isFullyHealthy ? 'HEALTHY' : isPartiallyHealthy ? 'PARTIALLY_HEALTHY' : 'FAIL',
      })
    },
  })
}

function plugin(
  app: AnyFastifyInstance,
  opts: CommonHealthcheckPluginOptions,
  done: () => void,
): void {
  addRoute(app, opts, {
    url: '/',
    useHealthcheckAggregations: true,
  })
  addRoute(app, opts, {
    url: '/health',
    useHealthcheckAggregations: false,
  })

  done()
}

export const commonHealthcheckPlugin: FastifyPluginCallback<CommonHealthcheckPluginOptions> = fp(
  plugin,
  {
    fastify: '5.x',
    name: 'common-healthcheck-plugin',
  },
)
