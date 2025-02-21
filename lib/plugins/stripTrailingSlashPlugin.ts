import type { FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'

const pluginCallback: FastifyPluginCallback = (fastify, _options, done) => {
  fastify.addHook('onRequest', (request, reply, done) => {
    // Using a hardcoded origin for simplicity and reliability,
    // as the request's origin is not relevant in this case.
    const { pathname, search } = new URL(request.url, 'https://example.com')

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
