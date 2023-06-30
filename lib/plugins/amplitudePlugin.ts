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

export type ApiUsageTrackingCallback = (req: FastifyRequest, res: FastifyReply) => AmplitudeEvent

export interface AmplitudeEvent extends BaseEvent {}

export interface AmplitudeConfig {
  isEnabled: boolean
  apiKey?: string
  amplitudeOptions?: NodeOptions
  //amplitudePlugins?: Plugin[]
  apiUsageTracking?: ApiUsageTrackingCallback
}

async function plugin(
  fastify: FastifyInstance,
  options: AmplitudeConfig,
  next: (err?: Error) => void,
) {
  if (!options.isEnabled) {
    return next()
  }

  if (!options.apiKey) {
    throw Error('Amplitude key not defined')
  }

  await init(options.apiKey, options.amplitudeOptions).promise
  apiUsageTracking(fastify, options)

  return next()
}

function apiUsageTracking(fastify: FastifyInstance, options: AmplitudeConfig) {
  if (!options.apiUsageTracking) return

  const { apiUsageTracking } = options
  fastify.addHook(
    'onResponse',
    (req: FastifyRequest, res: FastifyReply, done: HookHandlerDoneFunction) => {
      amplitudeTrack(apiUsageTracking(req, res))
      return done()
    },
  )
}

export const amplitudePlugin = fp<AmplitudeConfig>(plugin, {
  fastify: '4.x',
  name: 'amplitude-plugin',
})

export const amplitudeTrack = (event: AmplitudeEvent): AmplitudeReturn<Result> => track(event)
