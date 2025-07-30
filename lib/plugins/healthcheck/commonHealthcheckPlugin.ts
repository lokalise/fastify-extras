import type { Either } from '@lokalise/node-core'
import type { FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'
import type { AnyFastifyInstance } from '../pluginsCommon.js'
import type { HealthChecker } from './healthcheckCommons.js'

export interface CommonHealthcheckPluginOptions {
  responsePayload?: Record<string, unknown>
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  healthChecks: readonly HealthCheck[]
  infoProviders?: readonly InfoProvider[]
  isRootRouteEnabled?: boolean
  runOnStartup?: boolean
}

type HealthcheckRouteOptions = {
  url: string
  isPublicRoute: boolean
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
): ResolvedHealthcheckResponse {
  const healthChecks: Record<string, string> = {}
  let isFullyHealthy = true
  let isPartiallyHealthy = false

  // Return detailed healthcheck results
  for (let i = 0; i < results.length; i++) {
    const entry = results[i]
    if (!entry) continue

    healthChecks[entry.name] = entry.result.error ? 'FAIL' : 'HEALTHY'
    if (entry.result.error && opts.healthChecks[i]?.isMandatory) {
      isFullyHealthy = false
      isPartiallyHealthy = false
    }

    // Check if we are only partially healthy (only optional dependencies are failing)
    if (isFullyHealthy && entry.result.error && !opts.healthChecks[i]?.isMandatory) {
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

async function performHealthchecks(
  app: AnyFastifyInstance,
  opts: CommonHealthcheckPluginOptions,
): Promise<ResolvedHealthcheckResponse> {
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

    return resolveHealthcheckResults(results, opts)
  }

  return {
    isFullyHealthy: true,
    isPartiallyHealthy: false,
    healthChecks: {},
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
      hide: true,
    },

    handler: async (_, reply) => {
      const { isFullyHealthy, healthChecks, isPartiallyHealthy } = await performHealthchecks(
        app,
        opts,
      )

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

const plugin: FastifyPluginCallback<CommonHealthcheckPluginOptions> = (app, opts, done) => {
  const isRootRouteEnabled = opts.isRootRouteEnabled ?? true

  if (opts.runOnStartup) {
    app.addHook('onReady', async () => {
      const { healthChecks } = await performHealthchecks(app, opts)
      app.log.info({
        message: 'Healthcheck results',
        healthChecks,
      })
    })
  }

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

export const commonHealthcheckPlugin = fp(plugin, {
  fastify: '5.x',
  name: 'common-healthcheck-plugin',
})
