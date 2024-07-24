import { add, init } from '@amplitude/analytics-node'
import type { BaseEvent, NodeOptions, Plugin } from '@amplitude/analytics-types'
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify'
import fp from 'fastify-plugin'

import { Amplitude } from './Amplitude'

declare module 'fastify' {
  interface FastifyInstance {
    amplitude: Amplitude
  }
}

function plugin(fastify: FastifyInstance, config: AmplitudeConfig, next: (err?: Error) => void) {
  const amplitudeInstance = new Amplitude(config.isEnabled)
  fastify.decorate('amplitude', amplitudeInstance)

  if (!config.isEnabled) {
    return next()
  }

  if (!config.apiKey) {
    return next(Error('Amplitude key not defined'))
  }

  init(config.apiKey, config.options)
    .promise.then(() => {
      if (config.apiUsageTracking) {
        enableApiUsageTracking(fastify, amplitudeInstance, config.apiUsageTracking)
      }
      if (config.plugins) {
        for (const e of config.plugins) {
          // @ts-expect-error
          add(e)
        }
      }

      next()
    })
    .catch((err) => {
      next(err as Error)
    })
}

function enableApiUsageTracking(
  fastify: FastifyInstance,
  amplitude: Amplitude,
  eventCreationFn: CreateApiTrackingEventFn,
) {
  fastify.addHook(
    'onResponse',
    (req: FastifyRequest, res: FastifyReply, done: HookHandlerDoneFunction) => {
      const event = eventCreationFn(req, res)
      if (event) {
        amplitude.track(event)
      }
      return done()
    },
  )
}

/**
 * Callback used to create the events that will be used to automatically
 * track the API usage
 */
export type CreateApiTrackingEventFn = (req: FastifyRequest, res: FastifyReply) => BaseEvent | null

/**
 * Configuration to set up the Amplitude Plugin.
 *
 * @property {boolean} isEnabled Flag to enable or disable the plugin.
 *
 * @property {string} apiKey Amplitude api key, please get it from your
 * Amplitude project
 *
 * @property {NodeOptions} Amplitude configuration, please check
 * [this](https://amplitude.github.io/Amplitude-TypeScript/modules/_amplitude_analytics_node.Types.html#NodeOptions)
 * to learn more.
 *
 * @property {CreateApiTrackingEventFn} apiUsageTracking Callback used to create
 * the event that will be sent automatically to track the API usage. If not
 * specified the API usage track will be disabled.
 *
 * @property {Plugin[]} plugins Allow to extend plugin behavior by, for example,
 * modifying event properties. Please check
 * [this](https://www.docs.developers.amplitude.com/data/sdks/typescript-node/#plugins)
 * to see how it works
 */
export interface AmplitudeConfig {
  isEnabled: boolean
  apiKey?: string
  options?: NodeOptions
  apiUsageTracking?: CreateApiTrackingEventFn
  plugins?: Plugin[]
}

/**
 * Use this method to register the amplitude plugin on your fastify instance.
 *
 * Example of usage:
 * ```ts
 * await app.register(amplitudePlugin, {
 *     isEnabled: true,
 *     apiKey: 'dummy-api-key',
 *     options: {
 *       serverZone: 'EU',
 *     },
 * })
 * ```
 */
export const amplitudePlugin = fp<AmplitudeConfig>(plugin, {
  fastify: '4.x',
  name: 'amplitude-plugin',
})
