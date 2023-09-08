import type { Either } from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

export interface PublicHealthcheckPluginOptions {
  responsePayload?: Record<string, unknown>
  url?: string
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  healthChecks: readonly HealthCheck[]
}

export type HealthChecker = (app: FastifyInstance) => Promise<Either<Error, true>>

export type HealthCheck = {
  isMandatory: boolean
  checker: HealthChecker
}

function plugin(app: FastifyInstance, opts: PublicHealthcheckPluginOptions, done: () => void) {
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
    handler: async (_, reply) => {
      let isFullyHealthy = true
      let isPartiallyHealthy = false
      if (opts.healthChecks.length) {
        const results = await Promise.all(
          opts.healthChecks.map((healthcheck) => {
            return healthcheck.checker(app)
          }),
        )

        for (let i = 0; i < results.length; i++) {
          const entry = results[i]
          if (entry.error && opts.healthChecks[i].isMandatory) {
            isFullyHealthy = false
            isPartiallyHealthy = false
            break
          }
          if (entry.error && !opts.healthChecks[i].isMandatory) {
            isFullyHealthy = false
            isPartiallyHealthy = true
          }
        }
      }

      return reply.status(isFullyHealthy || isPartiallyHealthy ? 200 : 500).send({
        ...responsePayload,
        heartbeat: isFullyHealthy ? 'HEALTHY' : isPartiallyHealthy ? 'PARTIALLY_HEALTHY' : 'FAIL',
      })
    },
  })
  done()
}

export const publicHealthcheckPlugin = fp(plugin, {
  fastify: '4.x',
  name: 'public-healthcheck-plugin',
})
