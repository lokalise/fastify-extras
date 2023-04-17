import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

export interface PublicHealthcheckPluginOptions {
  responsePayload?: Record<string, unknown>
  healthChecks: readonly HealthCheck[]
}

export type HealthCheck = (app: FastifyInstance) => Promise<boolean>

function plugin(app: FastifyInstance, opts: PublicHealthcheckPluginOptions, done: () => void) {
  const responsePayload = opts.responsePayload ?? {}
  app.route({
    url: '/',
    method: 'GET',
    logLevel: 'debug',
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
            return !entry
          }) === false
        ) {
          isHealthy = false
        }
      }

      return reply.send({
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
