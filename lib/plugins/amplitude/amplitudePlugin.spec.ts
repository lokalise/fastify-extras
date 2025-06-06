import * as amplitude from '@amplitude/analytics-node'
import type { BaseEvent, EnrichmentPlugin, Event, Result } from '@amplitude/analytics-types'
import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vitest } from 'vitest'

import { amplitudePlugin } from './amplitudePlugin.js'

describe('amplitudePlugin', () => {
  let app: FastifyInstance

  beforeEach(() => {
    app = fastify()
  })

  afterEach(async () => {
    await app.close()
  })

  it('skips initialization if isEnabled is false', async () => {
    // Given
    const initSpy = vitest.spyOn(amplitude, 'init')

    // When
    await app.register(amplitudePlugin, {
      isEnabled: false,
    })

    // Then
    expect(initSpy).not.toHaveBeenCalled()
  })

  it('throws error if is enabled and api key is not defined', async () => {
    // Given
    const initSpy = vitest.spyOn(amplitude, 'init')

    // When
    let error = null
    try {
      await app.register(amplitudePlugin, {
        isEnabled: true,
      })
    } catch (e) {
      error = e
    }

    // Then
    expect(initSpy).not.toHaveBeenCalled()
    expect(error).not.toBeNull()
  })

  it('amplitudeTrack avoids track if plugin is not enabled', async () => {
    // Given
    const trackSpy = vitest.spyOn(amplitude, 'track')
    await app.register(amplitudePlugin, {
      isEnabled: false,
    })

    // When
    const result = await app.amplitude.track({
      event_type: 'event not tracked',
    }).promise

    // Then
    expect(result).toBeNull()
    expect(trackSpy).not.toHaveBeenCalled()
  })

  it('amplitudeTrack calls track if the plugin is enabled', async () => {
    // Given
    const trackResponse: Result = {
      event: { event_type: 'test' },
      code: 1,
      message: 'message',
    }
    const trackSpy = vitest.spyOn(amplitude, 'track').mockImplementation(() => ({
      promise: Promise.resolve(trackResponse),
    }))
    await app.register(amplitudePlugin, {
      isEnabled: true,
      apiKey: 'This is an api key',
    })

    // When
    const event: BaseEvent = { event_type: 'event tracked' }
    const response = await app.amplitude.track(event).promise

    // Then
    expect(response).toBe(trackResponse)
    expect(trackSpy).toHaveBeenCalledWith(event)
  })

  it('tracks api usage if apiUsageTracking callback returns an event', async () => {
    // Given
    const trackSpy = vitest.spyOn(amplitude, 'track').mockImplementation(() => ({
      promise: Promise.resolve<Result>({
        event: { event_type: 'test' },
        code: 1,
        message: 'message',
      }),
    }))
    const event: BaseEvent = { event_type: 'My api event' }
    await app.register(amplitudePlugin, {
      isEnabled: true,
      apiKey: 'This is an api key',
      apiUsageTracking: () => event,
    })

    // When
    const response = await app
      .route({
        url: '/test',
        method: 'GET',
        handler: (_, reply) => {
          return reply.send('Testing')
        },
      })
      .inject({
        method: 'GET',
        url: '/test',
      })

    // Then
    expect(response.statusCode).toBe(200)
    expect(response.body).toBe('Testing')
    expect(trackSpy).toHaveBeenCalledWith(event)
  })

  it('does not track api usage if apiUsageTracking returns null', async () => {
    // Given
    const trackSpy = vitest.spyOn(amplitude, 'track')
    await app.register(amplitudePlugin, {
      isEnabled: true,
      apiKey: 'This is an api key',
      apiUsageTracking: () => null,
    })

    // When
    const response = await app
      .route({
        url: '/test',
        method: 'GET',
        handler: (_, reply) => {
          return reply.send('Testing')
        },
      })
      .inject({
        method: 'GET',
        url: '/test',
      })

    // Then
    expect(response.statusCode).toBe(200)
    expect(response.body).toBe('Testing')
    expect(trackSpy).not.toHaveBeenCalled()
  })

  it('defined amplitude plugins are set up', async () => {
    // Given
    const addSpy = vitest.spyOn(amplitude, 'add')
    const plugin = new FakePlugin()
    const pluginSetUpSpy = vitest.spyOn(plugin, 'setup')

    // When
    await app.register(amplitudePlugin, {
      isEnabled: true,
      apiKey: 'This is an api key',
      plugins: [plugin],
    })

    // Then
    expect(addSpy).toHaveBeenCalledWith(plugin)
    expect(pluginSetUpSpy).toHaveBeenCalled()
  })
})

class FakePlugin implements EnrichmentPlugin {
  type = 'enrichment' as const
  setup = (): Promise<undefined> => Promise.resolve(undefined)
  execute = (event: Event): Promise<Event> => Promise.resolve(event)
}
