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
/**
 * @deprecated Use `NodeConfig` from `@bugsnag/node`, which `BugsnagErrorReporter` from `@lokalise/observability/bugsnag` takes.
 */
export type BugsnagConfig = Parameters<typeof startBugsnag>[0]

export interface BugsnagPluginConfig {
  bugsnag: BugsnagConfig
  isEnabled: boolean
}

function plugin(_app: FastifyInstance, opts: BugsnagPluginConfig, done: () => void) {
  if (opts.isEnabled) startBugsnag(opts.bugsnag)

  done()
}

/**
 * @deprecated Use `BugsnagErrorReporter` from `@lokalise/observability/bugsnag` instead. It starts a client of its own, so remove this plugin when you add it, or uncaught errors are reported twice.
 */
export const bugsnagPlugin: FastifyPluginCallback<BugsnagPluginConfig> = fp(plugin, {
  fastify: '5.x',
  name: 'bugsnag-plugin',
})
