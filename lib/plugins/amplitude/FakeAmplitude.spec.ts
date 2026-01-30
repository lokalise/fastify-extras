import { describe, expect, it } from 'vitest'

import { FakeAmplitude } from './FakeAmplitude.js'

describe('FakeAmplitude', () => {
  it('constructs successfully', () => {
    const fakeAmplitude = new FakeAmplitude()
    expect(fakeAmplitude).toBeInstanceOf(FakeAmplitude)
  })

  it('track returns resolved promise with null', async () => {
    const fakeAmplitude = new FakeAmplitude()
    const result = fakeAmplitude.track({
      event_type: 'test event',
      user_id: 'test-user',
    })

    expect(result.promise).toBeInstanceOf(Promise)
    const resolvedValue = await result.promise
    expect(resolvedValue).toBeNull()
  })
})