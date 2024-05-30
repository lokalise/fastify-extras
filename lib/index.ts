export {
  bugsnagPlugin,
  reportErrorToBugsnag,
  bugsnagErrorReporter,
  addFeatureFlag,
} from './plugins/bugsnagPlugin'
export type { ErrorReport } from './plugins/bugsnagPlugin'

export {
  requestContextProviderPlugin,
  getRequestIdFastifyAppConfig,
  REQUEST_ID_STORE_KEY,
} from './plugins/requestContextProviderPlugin'
export type { BaseRequestContext as RequestContext } from './plugins/requestContextProviderPlugin'

export {
  newrelicTransactionManagerPlugin,
  NewRelicTransactionManager,
} from './plugins/newrelicTransactionManagerPlugin'
export type { NewRelicTransactionManagerOptions } from './plugins/newrelicTransactionManagerPlugin'

export {
  splitIOFeatureManagerPlugin,
  SplitIOFeatureManager,
} from './plugins/splitIOFeatureManagerPlugin'
export type { SplitIOOptions } from './plugins/splitIOFeatureManagerPlugin'

export {
  healthcheckMetricsPlugin,
  wrapHealthCheckForPrometheus,
} from './plugins/healthcheck/healthcheckMetricsPlugin'
export type {
  PrometheusHealthCheck,
  HealthcheckResult,
  HealthcheckMetricsPluginOptions,
} from './plugins/healthcheck/healthcheckMetricsPlugin'

export { metricsPlugin } from './plugins/metricsPlugin'
export type { ErrorObjectResolver, MetricsPluginOptions } from './plugins/metricsPlugin'

export { prismaOtelTracingPlugin } from './plugins/opentelemetry/prismaOtelTracingPlugin'
export type { PrismaOtelTracingPluginConfig } from './plugins/opentelemetry/prismaOtelTracingPlugin'

export { publicHealthcheckPlugin } from './plugins/healthcheck/publicHealthcheckPlugin'
export type {
  PublicHealthcheckPluginOptions,
  HealthCheck,
  InfoProvider,
} from './plugins/healthcheck/publicHealthcheckPlugin'

export { wrapHealthCheck } from './plugins/healthcheck/healthcheckCommons'
export type { HealthChecker } from './plugins/healthcheck/healthcheckCommons'

export {
  amplitudePlugin,
  type AmplitudeConfig,
  type CreateApiTrackingEventFn,
} from './plugins/amplitude/amplitudePlugin'
export { Amplitude } from './plugins/amplitude/Amplitude'
export {
  AmplitudeAdapter,
  AMPLITUDE_BASE_MESSAGE_SCHEMA,
  type AmplitudeMessage,
  type AmplitudeAdapterDependencies,
} from './plugins/amplitude/AmplitudeAdapter'

export type { FastifyReplyWithPayload } from './types'

export {
  unhandledExceptionPlugin,
  commonErrorObjectResolver,
} from './plugins/unhandledExceptionPlugin'
export type { UnhandledExceptionPluginOptions } from './plugins/unhandledExceptionPlugin'

export { createErrorHandler, isZodError } from './errors/errorHandler'
export type { ErrorHandlerParams, FreeformRecord } from './errors/errorHandler'

export { generateJwtToken, decodeJwtToken } from './jwt-utils/tokenUtils'
