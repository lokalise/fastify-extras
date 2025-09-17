import type { FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'
import type { AnyFastifyInstance } from '../pluginsCommon.js'
import type { HealthCheckerSync } from './healthcheckCommons.js'

export interface CommonSyncHealthcheckPluginOptions {
  responsePayload?: Record<string, unknown>
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  healthChecks: readonly HealthCheckSync[]
  infoProviders?: readonly InfoProvider[]
  isRootRouteEnabled?: boolean
}

type HealthcheckRouteOptions = {
  url: string
  isPublicRoute: boolean
}

type HealthcheckResult = {
  name: string
  isMandatory: boolean
  healthcheckError: Error | null
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

export type HealthCheckSync = {
  name: string
  isMandatory: boolean
  checker: HealthCheckerSync
}

function resolveHealthcheckResults(
  results: HealthcheckResult[],
  opts: CommonSyncHealthcheckPluginOptions,
): ResolvedHealthcheckResponse {
  const healthChecks: Record<string, string> = {}
  let isFullyHealthy = true
  let isPartiallyHealthy = false

  // Return detailed healthcheck results
  for (let i = 0; i < results.length; i++) {
    const entry = results[i]
    if (!entry) continue

    healthChecks[entry.name] = entry.healthcheckError ? 'FAIL' : 'HEALTHY'
    if (entry.healthcheckError && opts.healthChecks[i]?.isMandatory) {
      isFullyHealthy = false
      isPartiallyHealthy = false
    }

    // Check if we are only partially healthy (only optional dependencies are failing)
    if (isFullyHealthy && entry.healthcheckError && !opts.healthChecks[i]?.isMandatory) {
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
  opts: CommonSyncHealthcheckPluginOptions,
  routeOpts: HealthcheckRouteOptions,
): void {
  const responsePayload = opts.responsePayload ?? {}

  app.route({
    url: routeOpts.url,
    method: 'GET',
    logLevel: opts.logLevel ?? 'info',
    schema: {
      // hide route from swagger plugins
      hide: true,
    },

    handler: (_, reply) => {
      let isFullyHealthy = true
      let isPartiallyHealthy = false
      let healthChecks: Record<string, string> = {}

      if (opts.healthChecks.length) {
        const results = opts.healthChecks.map((healthcheck) => {
          const healthcheckError = healthcheck.checker(app)
          if (healthcheckError) {
            app.log.error(healthcheckError, `${healthcheck.name} healthcheck has failed`)
          }
          return {
            name: healthcheck.name,
            healthcheckError,
            isMandatory: healthcheck.isMandatory,
          }
        })

        const resolvedHealthcheckResponse = resolveHealthcheckResults(results, opts)
        healthChecks = resolvedHealthcheckResponse.healthChecks
        isFullyHealthy = resolvedHealthcheckResponse.isFullyHealthy
        isPartiallyHealthy = resolvedHealthcheckResponse.isPartiallyHealthy
      }

      const extraInfo = opts.infoProviders?.map((infoProvider) => ({
        name: infoProvider.name,
        value: infoProvider.dataResolver(),
      }))

      const heartbeat = isFullyHealthy
        ? 'HEALTHY'
        : isPartiallyHealthy
          ? 'PARTIALLY_HEALTHY'
          : 'FAIL'

      const response = {
        ...responsePayload,
        heartbeat,
        ...(routeOpts.isPublicRoute
          ? {}
          : { checks: healthChecks, ...(extraInfo && { extraInfo }) }),
      }

      return reply.status(isFullyHealthy || isPartiallyHealthy ? 200 : 500).send(response)
    },
  })
}

const plugin: FastifyPluginCallback<CommonSyncHealthcheckPluginOptions> = (app, opts, done) => {
  const isRootRouteEnabled = opts.isRootRouteEnabled ?? true

  if (isRootRouteEnabled) {
    addRoute(app, opts, {
      url: '/',
      isPublicRoute: true,
    })
  }

  addRoute(app, opts, {
    url: '/health',
    isPublicRoute: false,
  })

  done()
}

export const commonSyncHealthcheckPlugin = fp(plugin, {
  fastify: '5.x',
  name: 'common-sync-healthcheck-plugin',
})
