import type { Either } from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

export interface PublicHealthcheckPluginOptions {
  responsePayload?: Record<string, unknown>
  url?: string
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  healthChecks: readonly HealthCheck[]
}

export type HealthCheck = (app: FastifyInstance) => Promise<Either<Error, true>>

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
      let isHealthy = true
      if (opts.healthChecks.length) {
        const results = await Promise.all(
          opts.healthChecks.map((healthcheck) => {
            return healthcheck(app)
          }),
        )
        if (
          results.find((entry) => {
            return !!entry.error
          })
        ) {
          isHealthy = false
        }
      }

      return reply.status(isHealthy ? 200 : 500).send({
        ...responsePayload,
        heartbeat: isHealthy ? 'HEALTHY' : 'FAIL',
      })
    },
  })
  done()
}

export const publicHealthcheckPlugin = fp(plugin, {
  fastify: '4.x',
  name: 'public-healthcheck-plugin',
})
