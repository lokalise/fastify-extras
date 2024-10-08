import type {
  FastifyReply,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify'
import type { RouteGenericInterface } from 'fastify/types/route'

export type FastifyReplyWithPayload<Payload extends RouteGenericInterface> = FastifyReply<
  RouteGenericInterface,
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  Payload
>
