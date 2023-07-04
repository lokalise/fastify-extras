import * as amplitude from '@amplitude/analytics-node'
import type { BaseEvent, EnrichmentPlugin, Result, Event } from '@amplitude/analytics-types'
import { buildClient, sendGet } from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import { amplitudePlugin, amplitudeTrack } from './amplitudePlugin'

describe('amplitudePlugin', () => {
  let app: FastifyInstance

  beforeEach(() => {
    app = fastify()
  })

  afterEach(async () => {
    await app.close()
  })

  it('skip initialization if isEnabled is false', async () => {
    const initSpy = jest.spyOn(amplitude, 'init')

    await app.register(amplitudePlugin, {
      isEnabled: false,
    })

    expect(initSpy).not.toHaveBeenCalled()
  })

  it('throw error if api key is not defined', async () => {
    const initSpy = jest.spyOn(amplitude, 'init')

    let error = null
    try {
      await app.register(amplitudePlugin, {
        isEnabled: true,
      })
    } catch (e) {
      error = e
    }

    expect(initSpy).not.toHaveBeenCalled()
    expect(error).not.toBeNull()
  })

  it('Basic initialization', async () => {
    const initSpy = jest.spyOn(amplitude, 'init')
    const addHookSpy = jest.spyOn(app, 'addHook')

    await app.register(amplitudePlugin, {
      isEnabled: true,
      apiKey: 'This is an api key',
    })

    expect(initSpy).toHaveBeenCalled()
    expect(addHookSpy).toHaveBeenCalledTimes(0)
  })

  it('initialization tracking api usage', async () => {
    const initSpy = jest.spyOn(amplitude, 'init')
    const addHookSpy = jest.spyOn(app, 'addHook')

    await app.register(amplitudePlugin, {
      isEnabled: true,
      apiKey: 'This is an api key',
      apiUsageTracking: (): BaseEvent => ({
        event_type: 'My test event',
      }),
    })

    expect(initSpy).toHaveBeenCalled()
    expect(addHookSpy).toHaveBeenCalled()
  })

  it('amplitude track', async () => {
    const trackSpy = jest.spyOn(amplitude, 'track').mockImplementation(() => ({
      promise: Promise.resolve<Result>({
        event: { event_type: 'test' },
        code: 1,
        message: 'message',
      }),
    }))
    await app.register(amplitudePlugin, {
      isEnabled: true,
      apiKey: 'This is an api key',
    })

    const event: BaseEvent = { event_type: 'event tracked' }
    amplitudeTrack(event)

    expect(trackSpy).toHaveBeenCalledWith(event)
  })

  it('api usage tracking', async () => {
    const trackSpy = jest.spyOn(amplitude, 'track').mockImplementation(() => ({
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
      apiUsageTracking: (): BaseEvent => event,
    })
    await app
      .route({
        url: '/test',
        method: 'GET',
        handler: async (_, reply) => {
          return reply.send('Testing')
        },
      })
      .listen({
        port: 9080,
        host: '0.0.0.0',
      })

    const response = await sendGet(buildClient('http://127.0.0.1:9080'), '/test')

    expect(response.result.statusCode).toBe(200)
    expect(response.result.body).toBe('Testing')
    expect(trackSpy).toHaveBeenCalledWith(event)
  })

  it('adding plugins', async () => {
    const addSpy = jest.spyOn(amplitude, 'add')
    const plugin = new FakePlugin()

    await app.register(amplitudePlugin, {
      isEnabled: true,
      apiKey: 'This is an api key',
      plugins: [plugin],
    })

    expect(addSpy).toHaveBeenCalledWith(plugin)
  })
})

class FakePlugin implements EnrichmentPlugin {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setup = (): Promise<undefined> => Promise.resolve(undefined)
  execute = (event: Event): Promise<Event> => Promise.resolve(event)
}
