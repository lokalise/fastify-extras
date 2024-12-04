import { AuthFailedError, type CommonLogger } from '@lokalise/node-core'
import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify'

const BEARER_PREFIX = 'Bearer '
const BEARER_PREFIX_LENGTH = BEARER_PREFIX.length

export function createStaticTokenAuthPreHandler(
  configuredSecretToken: string,
  loggerProvider: (req: FastifyRequest) => CommonLogger,
  authHeaderName = 'authorization',
) {
  return function preHandlerStaticTokenAuth(
    req: FastifyRequest,
    _: FastifyReply,
    done: HookHandlerDoneFunction,
  ) {
    const logger: CommonLogger = loggerProvider(req)

    const authHeaderValue = req.headers[authHeaderName]
    const authHeader =
      !!authHeaderValue && Array.isArray(authHeaderValue) ? authHeaderValue[0] : authHeaderValue

    if (!authHeader?.startsWith(BEARER_PREFIX)) {
      logger.error('Token not present')
      return done(new AuthFailedError())
    }

    const token = authHeader.substring(BEARER_PREFIX_LENGTH, authHeader.length)

    if (token !== configuredSecretToken) {
      logger.error('Invalid token')
      return done(new AuthFailedError())
    }
    done()
  }
}
