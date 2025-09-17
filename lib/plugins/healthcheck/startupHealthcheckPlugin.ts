import type { FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'
import { stdSerializers } from 'pino'
import { type HealthCheck, resolveHealthcheckResults } from './commonHealthcheckPlugin.js'

export interface StartupHealthcheckPluginOptions {
  resultsLogLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  healthChecks: readonly HealthCheck[]
}

const plugin: FastifyPluginCallback<StartupHealthcheckPluginOptions> = (app, opts, done) => {
  app.addHook('onReady', async () => {
    let isFullyHealthy = true
    let isPartiallyHealthy = false
    let healthChecks: Record<string, string> = {}
    const failedHealthchecks: string[] = []

    if (opts.healthChecks.length) {
      const results = await Promise.all(
        opts.healthChecks.map(async (healthcheck) => {
          const result = await healthcheck.checker(app)
          if (result.error) {
            app.log.error(
              {
                error: stdSerializers.err(result.error),
              },
              `${healthcheck.name} healthcheck has failed`,
            )
          }
          if (result.error) {
            failedHealthchecks.push(healthcheck.name)
          }
          return {
            name: healthcheck.name,
            result,
            isMandatory: healthcheck.isMandatory,
          }
        }),
      )

      const resolvedHealthcheckResponse = resolveHealthcheckResults(results, opts)
      healthChecks = resolvedHealthcheckResponse.healthChecks
      isFullyHealthy = resolvedHealthcheckResponse.isFullyHealthy
      isPartiallyHealthy = resolvedHealthcheckResponse.isPartiallyHealthy
    }

    const heartbeat = isFullyHealthy ? 'HEALTHY' : isPartiallyHealthy ? 'PARTIALLY_HEALTHY' : 'FAIL'

    const resultLog = {
      heartbeat,
      checks: healthChecks,
    }

    app.log[opts.resultsLogLevel ?? 'info'](resultLog, 'Healthcheck finished')

    if (!isPartiallyHealthy && !isFullyHealthy) {
      throw new Error(`Healthchecks failed: ${JSON.stringify(failedHealthchecks)}`)
    }
  })
  done()
}

export const startupHealthcheckPlugin = fp(plugin, {
  fastify: '5.x',
  name: 'startup-healthcheck-plugin',
})
