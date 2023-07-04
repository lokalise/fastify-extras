import { add, init, track } from '@amplitude/analytics-node'
import type {
  AmplitudeReturn,
  BaseEvent,
  NodeOptions,
  Plugin,
  Result,
} from '@amplitude/analytics-types'
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify'
import fp from 'fastify-plugin'

async function plugin(
  fastify: FastifyInstance,
  config: AmplitudeConfig,
  next: (err?: Error) => void,
) {
  if (!config.isEnabled) {
    return next()
  }

  if (!config.apiKey) {
    throw Error('Amplitude key not defined')
  }

  await init(config.apiKey, config.options).promise

  if (config.apiUsageTracking) {
    enableApiUsageTracking(fastify, config.apiUsageTracking)
  }
  if (config.plugins) {
    // @ts-expect-error
    config.plugins.forEach((e) => add(e))
  }

  return next()
}

function enableApiUsageTracking(
  fastify: FastifyInstance,
  eventCreationFn: createApiTrackingEventFn,
) {
  fastify.addHook(
    'onResponse',
    (req: FastifyRequest, res: FastifyReply, done: HookHandlerDoneFunction) => {
      const event = eventCreationFn(req, res)
      if (event) {
        amplitudeTrack(event)
      }
      return done()
    },
  )
}

/**
 * Callback used to create the events that will be used to automatically
 * track the API usage
 */
export type createApiTrackingEventFn = (req: FastifyRequest, res: FastifyReply) => BaseEvent | null

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
 * @property {createApiTrackingEventFn} apiUsageTracking Callback used to create
 * the event that will be send automatically to track the API usage. If not
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
  apiUsageTracking?: createApiTrackingEventFn
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

/**
 * Sends the given event to Amplitude
 *
 * @param event Event to send to amplitude. Please check
 * [this](https://amplitude.github.io/Amplitude-TypeScript/interfaces/_amplitude_analytics_node.Types.BaseEvent.html)
 * to get more info about the BaseEvent type
 */
export const amplitudeTrack = (event: BaseEvent): AmplitudeReturn<Result> => track(event)
