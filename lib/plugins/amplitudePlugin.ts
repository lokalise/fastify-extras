import { init, track } from '@amplitude/analytics-node'
import type { AmplitudeReturn, BaseEvent, NodeOptions, Result } from '@amplitude/analytics-types'
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify'
import fp from 'fastify-plugin'

//TODO: have a look to plugins -> https://www.docs.developers.amplitude.com/data/sdks/typescript-node/#plugins

export type ApiUsageTrackingCallback = (
  req: FastifyRequest,
  res: FastifyReply,
) => AmplitudeEvent | null

export interface AmplitudeEvent extends BaseEvent {}

export interface AmplitudeConfig {
  isEnabled: boolean
  apiKey?: string
  options?: NodeOptions
  apiUsageTracking?: ApiUsageTrackingCallback
  //plugins?: Plugin[]
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

  return next()
}

function enableApiUsageTracking(fastify: FastifyInstance, callback: ApiUsageTrackingCallback) {
  fastify.addHook(
    'onResponse',
    (req: FastifyRequest, res: FastifyReply, done: HookHandlerDoneFunction) => {
      const event = callback(req, res)
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

export const amplitudeTrack = (event: AmplitudeEvent): AmplitudeReturn<Result> => track(event)
