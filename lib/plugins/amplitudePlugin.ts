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

export type createApiTrackingEventFn = (req: FastifyRequest, res: FastifyReply) => BaseEvent | null

export interface AmplitudeConfig {
  isEnabled: boolean
  apiKey?: string
  options?: NodeOptions
  apiUsageTracking?: createApiTrackingEventFn
  plugins?: Plugin[]
}

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

export const amplitudePlugin = fp<AmplitudeConfig>(plugin, {
  fastify: '4.x',
  name: 'amplitude-plugin',
})

export const amplitudeTrack = (event: BaseEvent): AmplitudeReturn<Result> => track(event)
