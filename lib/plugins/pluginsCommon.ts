import type { CommonLogger } from '@lokalise/node-core'
import type {
  FastifyInstance,
  FastifyTypeProviderDefault,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify'

export type CommonFastifyInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  CommonLogger,
  FastifyTypeProviderDefault
>

// biome-ignore lint/suspicious/noExplicitAny: This is intentional
export type AnyFastifyInstance = FastifyInstance<any, any, any, any, any>
