import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

function plugin(app: FastifyInstance, _opts: unknown, done: () => void) {
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
      return reply.send({ status: 'OK' })
    },
  })
  done()
}

export const publicHealthcheckPlugin = fp(plugin, {
  fastify: '4.x',
  name: 'public-healthcheck-plugin',
})
