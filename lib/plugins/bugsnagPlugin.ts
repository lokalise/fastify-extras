import Bugsnag from '@bugsnag/js'
import type { NodeConfig } from '@bugsnag/node'
import {
  type ErrorReport,
  type Severity,
  addFeatureFlag,
  bugsnagErrorReporter,
  reportErrorToBugsnag,
} from '@lokalise/error-utils'
import type { FastifyInstance, FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'

export {
  reportErrorToBugsnag,
  addFeatureFlag,
  bugsnagErrorReporter,
  type ErrorReport,
  type Severity,
}

export interface BugsnagPluginConfig {
  bugsnag: NodeConfig
  isEnabled: boolean
}

function plugin(_app: FastifyInstance, opts: BugsnagPluginConfig, done: () => void) {
  if (opts.isEnabled) {
    Bugsnag.default.start(opts.bugsnag)
  }

  done()
}

export const bugsnagPlugin: FastifyPluginCallback<BugsnagPluginConfig> = fp(plugin, {
  fastify: '5.x',
  name: 'bugsnag-plugin',
})
