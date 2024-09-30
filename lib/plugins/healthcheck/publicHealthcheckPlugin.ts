import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import type { CommonLogger } from '@lokalise/node-core'
import type { FastifyTypeProviderDefault } from 'fastify/types/type-provider'
import type {
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify/types/utils'
import type { HealthChecker } from './healthcheckCommons'

export interface PublicHealthcheckPluginOptions {
  responsePayload?: Record<string, unknown>
  url?: string
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  healthChecks: readonly HealthCheck[]
  infoProviders?: readonly InfoProvider[]
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

function plugin(
  app: FastifyInstance<
    RawServerDefault,
    RawRequestDefaultExpression,
    RawReplyDefaultExpression,
    CommonLogger,
    FastifyTypeProviderDefault
  >,
  opts: PublicHealthcheckPluginOptions,
  done: () => void,
) {
  const responsePayload = opts.responsePayload ?? {}
  app.route({
    url: opts.url ?? '/health',
    method: 'GET',
    logLevel: opts.logLevel ?? 'info',
    schema: {
      // hide route from swagger plugins
      // @ts-expect-error
      hide: true,
    },

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: <explanation>
    handler: async (_, reply) => {
      let isFullyHealthy = true
      let isPartiallyHealthy = false
      const healthChecks: Record<string, unknown> = {}

      if (opts.healthChecks.length) {
        const results = await Promise.all(
          opts.healthChecks.map((healthcheck) => {
            return healthcheck.checker(app).then((result) => {
              if (result.error) {
                app.log.error(result.error, `${healthcheck.name} healthcheck has failed`)
              }
              return {
                name: healthcheck.name,
                result,
                isMandatory: healthcheck.isMandatory,
              }
            })
          }),
        )

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
      }

      const extraInfo = opts.infoProviders
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
  done()
}

export const publicHealthcheckPlugin = fp(plugin, {
  fastify: '5.x',
  name: 'public-healthcheck-plugin',
})
