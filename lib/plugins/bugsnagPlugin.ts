import type { Event, NotifiableError } from '@bugsnag/js'
import Bugsnag from '@bugsnag/js'
import type { NodeConfig } from '@bugsnag/node'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

export type Severity = Event['severity']

export type ErrorReport = {
  error: NotifiableError
  severity?: Severity
  unhandled?: boolean
  context?: Record<string, unknown>
}

export const reportErrorToBugsnag = ({
  error,
  severity = 'error',
  unhandled = true,
  context,
}: ErrorReport) =>
  Bugsnag.isStarted() &&
  Bugsnag.notify(error, (event) => {
    event.severity = severity
    event.unhandled = unhandled
    if (context) {
      event.addMetadata('Context', context)
    }
  })

function plugin(app: FastifyInstance, opts: NodeConfig, done: () => void) {
  Bugsnag.start(opts)

  done()
}

export const bugsnagPlugin = fp(plugin, {
  fastify: '4.x',
  name: 'bugsnag-plugin',
})
