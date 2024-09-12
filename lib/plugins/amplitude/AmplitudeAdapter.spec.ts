import { randomUUID } from 'node:crypto'

import type { MockInstance } from 'vitest'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { Amplitude } from './Amplitude'
import { AMPLITUDE_BASE_MESSAGE_SCHEMA, AmplitudeAdapter } from './AmplitudeAdapter'
import type { AmplitudeMessage } from './AmplitudeAdapter'

const testMessages: Record<string, AmplitudeMessage> = {
  myEvent: {
    schema: AMPLITUDE_BASE_MESSAGE_SCHEMA.extend({
      event_type: z.literal('my event'),
      event_properties: z.object({
        number: z.number(),
      }),
    }),
  },
}
const testMessagesValues = Object.values(testMessages)
type SupportedMessages = typeof testMessagesValues

describe('Amplitude adapter', () => {
  let amplitudeAdapter: AmplitudeAdapter<SupportedMessages>
  let amplitudeTrackSpy: MockInstance

  beforeEach(() => {
    const amplitude = new Amplitude(true)
    amplitudeTrackSpy = vi
      .spyOn(amplitude, 'track')
      .mockImplementation(() => ({ promise: Promise.resolve(null) }))
    amplitudeAdapter = new AmplitudeAdapter({ amplitude })
  })

  it('works', () => {
    const user_id = randomUUID()
    amplitudeAdapter.track(testMessages.myEvent, {
      user_id,
      event_properties: { number: 42 },
    })

    expect(amplitudeTrackSpy).toHaveBeenCalledWith({
      event_type: 'my event',
      user_id,
      event_properties: { number: 42 },
    })
  })

  it('works with user_id SYSTEM', () => {
    const user_id = 'SYSTEM'
    amplitudeAdapter.track(testMessages.myEvent, {
      user_id,
      event_properties: { number: 42 },
    })

    expect(amplitudeTrackSpy).toHaveBeenCalledWith({
      event_type: 'my event',
      user_id,
      event_properties: { number: 42 },
    })
  })

  it('wrong type', () => {
    expect(() =>
      amplitudeAdapter.track(testMessages.myEvent, {
        user_id: randomUUID(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event_properties: { number: 'bad' as any },
      }),
    ).toThrow(z.ZodError)
  })

  it('wrong user id', () => {
    expect(() =>
      amplitudeAdapter.track(testMessages.myEvent, {
        user_id: 'wrong',
        event_properties: {
          number: 1,
        },
      }),
    ).toThrow(z.ZodError)
  })
})
