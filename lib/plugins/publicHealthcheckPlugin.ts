import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

export interface PublicHealthcheckPluginOptions {
  responsePayload?: Record<string, unknown>
}

function plugin(app: FastifyInstance, opts: PublicHealthcheckPluginOptions, done: () => void) {
  const responsePayload = opts.responsePayload ?? { status: 'OK' }
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
      return reply.send(responsePayload)
    },
  })
  done()
}

export const publicHealthcheckPlugin = fp(plugin, {
  fastify: '4.x',
  name: 'public-healthcheck-plugin',
})
