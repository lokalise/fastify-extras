import z, { type ZodObject } from 'zod'

import type { Amplitude } from './Amplitude'

export const AMPLITUDE_BASE_MESSAGE_SCHEMA = z
  .object({
    event_type: z.literal<string>('<replace.me>'),
    event_properties: z.object({}),
    user_id: z.string().uuid().or(z.literal('SYSTEM')),
  })
  .strip()

export type AmplitudeAdapterDependencies = {
  amplitude: Amplitude
}

export type AmplitudeMessage = {
  schema: ZodObject<(typeof AMPLITUDE_BASE_MESSAGE_SCHEMA)['shape']>
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
