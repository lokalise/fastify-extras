import type { AmplitudeReturn, Result } from '@amplitude/analytics-types'
import type { BaseEvent } from '@amplitude/analytics-types/lib/esm/base-event.d.ts'
import { Amplitude } from './Amplitude.ts'

export class FakeAmplitude extends Amplitude {
  constructor() {
    super(false)
  }

  override track(_: BaseEvent): AmplitudeReturn<Result | null> {
    return {
      promise: Promise.resolve(null),
    }
  }
}
