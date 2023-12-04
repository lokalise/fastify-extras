import type { Event, NotifiableError } from '@bugsnag/js'
import Bugsnag from '@bugsnag/js'
import type { NodeConfig } from '@bugsnag/node'
import type { ErrorReporter } from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

export type Severity = Event['severity']

export interface ErrorReport {
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

export interface BugsnagPluginConfig {
  bugsnag: NodeConfig
  isEnabled: boolean
}

export const bugsnagErrorReporter = {
  report: (report) => reportErrorToBugsnag(report),
} satisfies ErrorReporter

function plugin(app: FastifyInstance, opts: BugsnagPluginConfig, done: () => void) {
  if (opts.isEnabled) {
    Bugsnag.start(opts.bugsnag)
  }

  done()
}

export const bugsnagPlugin = fp(plugin, {
  fastify: '4.x',
  name: 'bugsnag-plugin',
})
