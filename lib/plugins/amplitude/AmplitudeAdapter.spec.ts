import { randomUUID } from 'node:crypto'

import type { MockInstance } from 'vitest'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { Amplitude } from './Amplitude.js'
import { AMPLITUDE_BASE_MESSAGE_SCHEMA, AmplitudeAdapter } from './AmplitudeAdapter.js'
import type { AmplitudeMessage } from './AmplitudeAdapter.js'

const testMessages = {
  myEvent: {
    schema: AMPLITUDE_BASE_MESSAGE_SCHEMA.extend({
      event_type: z.literal('my event'),
      event_properties: z.object({
        number: z.number(),
      }),
    }),
  },
} as const satisfies Record<'myEvent', AmplitudeMessage>
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

  it('accepts groups', () => {
    const user_id = '1'
    amplitudeAdapter.track(testMessages.myEvent, {
      user_id,
      groups: { myGroup: 'value', myOtherGroup: 'otherValue' },
      event_properties: { number: 42 },
    })

    expect(amplitudeTrackSpy).toHaveBeenCalledWith({
      user_id,
      event_type: 'my event',
      groups: { myGroup: 'value', myOtherGroup: 'otherValue' },
      event_properties: { number: 42 },
    })
  })

  it('accepts groups with multiple values', () => {
    const user_id = '2'
    amplitudeAdapter.track(testMessages.myEvent, {
      user_id,
      groups: { myGroup: ['value1', 'value2'] },
      event_properties: { number: 42 },
    })

    expect(amplitudeTrackSpy).toHaveBeenCalledWith({
      user_id,
      event_type: 'my event',
      groups: { myGroup: ['value1', 'value2'] },
      event_properties: { number: 42 },
    })
  })

  it('wrong type', () => {
    expect(() =>
      amplitudeAdapter.track(testMessages.myEvent, {
        user_id: randomUUID(),
        event_properties: { number: 'bad' as any },
      }),
    ).toThrow(z.ZodError)
  })

  it('wrong group type', () => {
    expect(() =>
      amplitudeAdapter.track(testMessages.myEvent, {
        user_id: randomUUID(),
        event_properties: {
          number: 1,
        },
        // @ts-expect-error intentional wrong type
        groups: 123,
      }),
    ).toThrow(z.ZodError)
  })

  it('wrong user id', () => {
    expect(() =>
      amplitudeAdapter.track(testMessages.myEvent, {
        user_id: '',
        event_properties: {
          number: 1,
        },
        groups: {},
      }),
    ).toThrowError(z.ZodError)
  })
})
