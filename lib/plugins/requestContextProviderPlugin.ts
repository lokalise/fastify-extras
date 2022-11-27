import { randomUUID } from 'crypto'

import { requestContext } from '@fastify/request-context'
import type {
  FastifyReply,
  FastifyRequest,
  FastifyInstance,
  HookHandlerDoneFunction,
  FastifyServerOptions,
  FastifyBaseLogger,
} from 'fastify'
import fp from 'fastify-plugin'

export const REQUEST_ID_STORE_KEY = 'request_id'

declare module 'fastify' {
  interface FastifyRequest {
    reqContext: RequestContext
  }
}

export type RequestContext = {
  logger?: FastifyBaseLogger
  reqId: string
}

export function getRequestIdFastifyAppConfig() {
  const result: Pick<FastifyServerOptions, 'genReqId' | 'requestIdHeader'> = {
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
  }

  return result
}

function plugin(fastify: FastifyInstance, opts: unknown, done: () => void) {
  fastify.addHook(
    'onRequest',
    (req: FastifyRequest, res: FastifyReply, next: HookHandlerDoneFunction) => {
      req.reqContext = {
        logger: req.log,
        reqId: req.id as string,
      }

      // Store request_id in AsyncLocalStorage to be picked up by instrumentation tooling, such as OpenTelemetry
      requestContext.set(REQUEST_ID_STORE_KEY, req.id)

      next()
    },
  )

  fastify.addHook(
    'onSend',
    (req: FastifyRequest, res: FastifyReply, payload, next: HookHandlerDoneFunction) => {
      void res.header('x-request-id', req.id)
      next()
    },
  )

  done()
}

export const requestContextProviderPlugin = fp(plugin, {
  fastify: '4.x',
  name: 'request-context-provider-plugin',
})
