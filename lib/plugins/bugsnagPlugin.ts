import Bugsnag from '@bugsnag/js'
import type { NodeConfig } from '@bugsnag/node'
import {
  bugsnagErrorReporter,
  type ErrorReport,
  reportErrorToBugsnag,
  addFeatureFlag,
  type Severity,
} from '@lokalise/error-utils'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

export { reportErrorToBugsnag, addFeatureFlag, bugsnagErrorReporter, ErrorReport, Severity }

export interface BugsnagPluginConfig {
  bugsnag: NodeConfig
  isEnabled: boolean
}

function plugin(_app: FastifyInstance, opts: BugsnagPluginConfig, done: () => void) {
  if (opts.isEnabled) {
    Bugsnag.start(opts.bugsnag)
  }

  done()
}

export const bugsnagPlugin = fp(plugin, {
  fastify: '4.x',
  name: 'bugsnag-plugin',
})
