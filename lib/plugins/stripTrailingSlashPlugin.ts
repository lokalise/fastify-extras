import type { FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'

const pluginCallback: FastifyPluginCallback = (fastify, _options, done) => {
  fastify.addHook('onRequest', (request, reply, done) => {
    const { pathname, search } = new URL(
      `${request.protocol}://${request.hostname}:${request.port}${request.url}`,
    )

    if (pathname.length > 1 && pathname.endsWith('/')) {
      reply.redirect(`${pathname.slice(0, -1)}${search}`, 302)
    } else {
      done()
    }
  })

  done()
}

export const stripTrailingSlashPlugin = fp(pluginCallback, {
  fastify: '5.x',
  name: 'strip-trailing-slash-plugin',
})
