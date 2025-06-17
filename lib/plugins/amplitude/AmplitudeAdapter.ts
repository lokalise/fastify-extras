import { z } from 'zod/v4'

import type { Amplitude } from './Amplitude.js'

export const AMPLITUDE_BASE_MESSAGE_SCHEMA = z
  .object({
    event_type: z.literal<string>('<replace.me>'),
    user_id: z.string().min(1).or(z.literal('SYSTEM')),
    groups: z.record(z.string(), z.any()).optional(),
  })
  .strip()

export type AmplitudeAdapterDependencies = {
  amplitude: Amplitude
}

export type AmplitudeMessage = {
  schema: z.ZodObject<(typeof AMPLITUDE_BASE_MESSAGE_SCHEMA)['shape'], z.core.$strip>
}
type AmplitudeMessageSchemaType<T extends AmplitudeMessage> = z.infer<T['schema']>

/**
 * Amplitude adapter which provides type safe tracking of events
 */
export class AmplitudeAdapter<AmplitudeMessages extends AmplitudeMessage[]> {
  private readonly amplitude: Amplitude

  constructor({ amplitude }: AmplitudeAdapterDependencies) {
    this.amplitude = amplitude
  }

  public track<Message extends AmplitudeMessages[number]>(
    supportedMessage: Message,
    data: Omit<AmplitudeMessageSchemaType<Message>, 'event_type'>,
  ) {
    const message = supportedMessage.schema.parse({
      event_type: supportedMessage.schema.shape.event_type.value,
      ...data,
    })
    this.amplitude.track(message)
  }
}
