import { randomUUID } from 'node:crypto'

import type { CommonLogger } from '@lokalise/node-core'
import type {
  FastifyReply,
  FastifyRequest,
  FastifyInstance,
  HookHandlerDoneFunction,
  FastifyServerOptions,
} from 'fastify'
import fp from 'fastify-plugin'

// Augment existing FastifyRequest interface with new fields
declare module 'fastify' {
  interface FastifyRequest {
    reqContext: RequestContext
  }
}

export interface BaseRequestContext {
  logger: CommonLogger
  reqId: string
}

// Add new interface to the fastify module
declare module 'fastify' {
  interface RequestContext extends BaseRequestContext {}
}

export function getRequestIdFastifyAppConfig(): Pick<
  FastifyServerOptions,
  'genReqId' | 'requestIdHeader'
> {
  return {
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
  }
}

function plugin(fastify: FastifyInstance, opts: unknown, done: () => void) {
  fastify.addHook(
    'onRequest',
    function onRequestContextProvider(
      req: FastifyRequest,
      res: FastifyReply,
      next: HookHandlerDoneFunction,
    ) {
      req.reqContext = {
        logger: (req.log as CommonLogger).child({
          'x-request-id': req.id,
        }),
        reqId: req.id,
      }

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
