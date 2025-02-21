import type { FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'

const pluginCallback: FastifyPluginCallback = (fastify, _options, done) => {
  fastify.addHook('onRequest', (request, reply, done) => {
    const questionMarkIndex = request.url.indexOf('?')

    const path = questionMarkIndex === -1 ? request.url : request.url.slice(0, questionMarkIndex)

    const search = questionMarkIndex === -1 ? '' : request.url.slice(questionMarkIndex)

    if (path.length > 1 && path.endsWith('/')) {
      reply.redirect(`${path.slice(0, -1)}${search}`, 302)
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
