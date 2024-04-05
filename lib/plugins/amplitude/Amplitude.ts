import { track } from '@amplitude/analytics-node'
import type { AmplitudeReturn, BaseEvent, Result } from '@amplitude/analytics-types'

export class Amplitude {
  private readonly isEnabled: boolean

  constructor(isEnabled: boolean) {
    this.isEnabled = isEnabled
  }

  /**
   * Sends the given event to Amplitude
   *
   * @param event Event to send to amplitude. Please check
   * [this](https://amplitude.github.io/Amplitude-TypeScript/interfaces/_amplitude_analytics_node.Types.BaseEvent.html)
   * to get more info about the BaseEvent type
   */
  public track(event: BaseEvent): AmplitudeReturn<Result | null> {
    return this.isEnabled ? track(event) : { promise: Promise.resolve(null) }
  }
}
