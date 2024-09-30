import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'
import fastifyMetrics from 'fastify-metrics'
import fp from 'fastify-plugin'
import type { Logger } from 'pino'

const METRICS_PORT = 9080

export type ErrorObjectResolver = (err: unknown, correlationID?: string) => unknown

export interface MetricsPluginOptions {
  logger: Logger | false
  disablePrometheusRequestLogging?: boolean
  bindAddress?: string
  errorObjectResolver: ErrorObjectResolver
}

function plugin(app: FastifyInstance, opts: MetricsPluginOptions, done: (err?: Error) => void) {
  void app.register(fastifyMetrics, {
    defaultMetrics: { enabled: true },
    endpoint: null,
    clearRegisterOnInit: true,
    name: 'metrics',
    routeMetrics: { enabled: true },
  })
  try {
    const promServer = fastify({
      loggerInstance: opts.logger ? opts.logger : undefined,
      logger: opts.logger === false ? false : undefined,
      disableRequestLogging: opts.disablePrometheusRequestLogging ?? true,
    })

    promServer.route({
      url: '/metrics',
      method: 'GET',
      logLevel: 'info',
      schema: {
        // hide route from swagger plugins
        // @ts-expect-error
        hide: true,
      },
      handler: async (_, reply) => {
        const metrics = await app.metrics.client.register.metrics()
        return reply.type('text/plain').send(metrics)
      },
    })

    app.addHook('onClose', async () => {
      await promServer.close()
    })

    promServer
      .listen({
        port: METRICS_PORT,
        host: opts.bindAddress,
        listenTextResolver: (address) => {
          return `Prometheus metrics server listening at ${address}`
        },
      })
      .then(() => {
        done()
      })
      .catch((err) => {
        const logObject = opts.errorObjectResolver(err)
        promServer.log.error(logObject)
        done(new Error('Critical error when trying to launch metrics server'))
      })
  } catch (err) {
    done(err as Error)
  }
}

export const metricsPlugin = fp(plugin, {
  fastify: '5.x',
  name: 'metrics-plugin',
})
