import type { ErrorReporter } from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

export type ErrorObjectResolver = (err: unknown, correlationID?: string) => unknown

export interface UnhandledExceptionPluginOptions {
  errorObjectResolver: ErrorObjectResolver
  errorReporter: ErrorReporter
}

function plugin(app: FastifyInstance, opts: UnhandledExceptionPluginOptions) {
  // Handle unhandled exceptions
  process.on('uncaughtException', (err) => {
    const logObject = opts.errorObjectResolver(err)
    app.log.fatal(logObject, 'uncaught exception detected')
    opts.errorReporter.report({ error: err })

    // shutdown the server gracefully
    app.close(() => {
      process.exit(1) // then exit
    })
  })
}

export const unhandledExceptionPlugin = fp(plugin, {
  fastify: '4.x',
  name: 'unhandled-exception-plugin',
})
