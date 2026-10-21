import {
  addFeatureFlag,
  bugsnagErrorReporter,
  type ErrorReport,
  reportErrorToBugsnag,
  type Severity,
  startBugsnag,
} from '@lokalise/error-utils'
import type { FastifyInstance, FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'

export {
  addFeatureFlag,
  bugsnagErrorReporter,
  type ErrorReport,
  reportErrorToBugsnag,
  type Severity,
}

// Typed from error-utils so the config always matches the Bugsnag client that reports errors
export type BugsnagConfig = Parameters<typeof startBugsnag>[0]

export interface BugsnagPluginConfig {
  bugsnag: BugsnagConfig
  isEnabled: boolean
}

function plugin(_app: FastifyInstance, opts: BugsnagPluginConfig, done: () => void) {
  if (opts.isEnabled) startBugsnag(opts.bugsnag)

  done()
}

export const bugsnagPlugin: FastifyPluginCallback<BugsnagPluginConfig> = fp(plugin, {
  fastify: '5.x',
  name: 'bugsnag-plugin',
})
