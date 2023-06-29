import { init, track } from '@amplitude/analytics-node'
import type { AmplitudeReturn, NodeOptions, Result } from '@amplitude/analytics-types'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

export interface AmplitudePluginConfig {
  isEnabled: boolean
  apiKey?: string
  amplitudeOptions?: NodeOptions
  apiUsageTracking?: {
    eventPrefix: string
    trackingEndpoints?: Set<string>
  }
}

function apiUsageTracking(options: AmplitudePluginConfig) {
  if (!options.apiUsageTracking) return

  const { apiUsageTracking } = options
  if (apiUsageTracking.trackingEndpoints?.size == 0) return
  // TODO
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
  apiUsageTracking(options)

  return next()
}

export const amplitudePlugin = fp<AmplitudePluginConfig>(plugin, {
  fastify: '4.x',
  name: 'amplitude-plugin',
})

// TODO: remove -> testing purposes
export const testTrack = () => {
  track('AP-21 testing', undefined, { user_id: '00001' })
}
