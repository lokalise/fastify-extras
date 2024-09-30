import type { CommonLogger } from '@lokalise/node-core'
import type { FastifyInstance } from 'fastify'
import type { FastifyTypeProviderDefault } from 'fastify/types/type-provider'
import type {
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify/types/utils'

export type CommonFastifyInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  CommonLogger,
  FastifyTypeProviderDefault
>

// biome-ignore lint/suspicious/noExplicitAny: This is intentional
export type AnyFastifyInstance = FastifyInstance<any, any, any, any, any>
