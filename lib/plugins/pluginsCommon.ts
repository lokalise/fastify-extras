import type { AppConfig, CommonLogger } from '@lokalise/node-core'
import {
  type FastifyInstance,
  type FastifyServerOptions,
  type FastifyTypeProviderDefault,
  LogController,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
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

// Service utility endpoints to exclude from request logging
const REQUEST_LOGGING_SKIP_PATHS = new Set(['/', '/health', '/ready', '/live', '/metrics'])
const REQUEST_LOGGING_LEVELS = ['debug', 'trace', 'info']

export function getFastifyAppLoggingConfig(
  appLogLevel: AppConfig['logLevel'],
  requestLoggingLevels = REQUEST_LOGGING_LEVELS,
): Pick<FastifyServerOptions, 'logController'> {
  const enableRequestLogging = requestLoggingLevels.includes(appLogLevel)
  return {
    logController: new LogController({
      disableRequestLogging: enableRequestLogging
        ? (req) => REQUEST_LOGGING_SKIP_PATHS.has(req.url)
        : true,
    }),
  }
}
