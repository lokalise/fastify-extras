import crypto from 'crypto'

import { init, track } from '@amplitude/analytics-node'
import type { AmplitudeReturn, BaseEvent, NodeOptions, Result } from '@amplitude/analytics-types'
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify'
import fp from 'fastify-plugin'

export interface AmplitudePluginConfig {
  isEnabled: boolean
  apiKey?: string
  amplitudeOptions?: NodeOptions
  apiUsageTracking?: {
    eventPrefix: string
    // trackingEndpoints?: Set<string> // TODO: Do we want this?
  }
}

function apiUsageTracking(fastify: FastifyInstance, options: AmplitudePluginConfig) {
  if (!options.apiUsageTracking) return
  const { apiUsageTracking } = options

  const apiHook = (req: FastifyRequest, res: FastifyReply, done: HookHandlerDoneFunction) => {
    const endpoint = `${req.method} ${req.routerPath}`
    amplitudeTrack({
      event_type: `${apiUsageTracking.eventPrefix} - ${endpoint}`,
      user_id: '00001', // TODO: requested field
      insert_id: crypto.randomBytes(16).toString('hex'), // TODO: why do we need this?
      groups: {
        Teams: '', // TODO
        Projects: '', // TODO
      },
      event_properties: {
        endpoint: `${req.method} ${req.routerPath}`,
        success: res.statusCode >= 200 && res.statusCode < 300,
        request_params: req.params,
      },
    })
    return done()
  }
  fastify.addHook('onResponse', apiHook)
}

async function plugin(
  fastify: FastifyInstance,
  options: AmplitudePluginConfig,
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

export const amplitudePlugin = fp<AmplitudePluginConfig>(plugin, {
  fastify: '4.x',
  name: 'amplitude-plugin',
})

export const amplitudeTrack = (event: BaseEvent): AmplitudeReturn<Result> => track(event)
