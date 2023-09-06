import type { Either } from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

const VALID_PROMETHEUS_NAME_REGEX = /[a-zA-Z_:][a-zA-Z0-9_:]*/

export interface HealthcheckMetricsPluginOptions {
  healthChecks: readonly PrometheusHealthCheck[]
}

export type HealthcheckResult = {
  checkTimeInMsecs: number
  checkPassed: boolean
}

export type PrometheusHealthCheck = {
  name: string
  checker: (app: FastifyInstance) => Promise<Either<Error, HealthcheckResult>>
}

function plugin(
  app: FastifyInstance,
  opts: HealthcheckMetricsPluginOptions,
  done: (err?: Error) => void,
) {
  const invalidNames = []

  for (const healthcheck of opts.healthChecks) {
    if (!VALID_PROMETHEUS_NAME_REGEX.test(healthcheck.name)) {
      invalidNames.push(healthcheck.name)
    }
  }

  if (invalidNames.length > 0) {
    return done(new Error(`Invalid healthcheck names: ${JSON.stringify(invalidNames)}`))
  }

  try {
    const promClient = app.metrics.client
    if (!promClient) {
      throw new Error('Prometheus client is not registered')
    }

    for (const check of opts.healthChecks) {
      new promClient.Gauge({
        name: `${check.name}_availability`,
        help: `Whether ${check.name} was available at the time`,
        async collect() {
          const checkResult = await check.checker(app)

          if (checkResult.result?.checkPassed) {
            this.set(1)
          } else {
            this.set(0)
          }
        },
      })

      new promClient.Gauge({
        name: `${check.name}_latency_msecs`,
        help: `How long the healthcheck for ${check.name} took`,
        async collect() {
          const checkResult = await check.checker(app)

          if (checkResult.result?.checkPassed) {
            this.set(checkResult.result.checkTimeInMsecs)
          } else {
            this.set(checkResult.result?.checkTimeInMsecs ?? 0)
          }
        },
      })
    }
  } catch (err: unknown) {
    return done(err as Error)
  }

  done()
}

export const healthcheckMetricsPlugin = fp(plugin, {
  fastify: '4.x',
  name: 'healthcheck-metrics-plugin',
})
