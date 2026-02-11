export {
  bugsnagPlugin,
  reportErrorToBugsnag,
  bugsnagErrorReporter,
  addFeatureFlag,
} from './plugins/bugsnagPlugin.js'
export type { ErrorReport } from './plugins/bugsnagPlugin.js'

export {
  requestContextProviderPlugin,
  getRequestIdFastifyAppConfig,
} from './plugins/requestContextProviderPlugin.js'
export type { BaseRequestContext as RequestContext } from './plugins/requestContextProviderPlugin.js'

export {
  newrelicTransactionManagerPlugin,
  NewRelicTransactionManager,
} from './plugins/newrelicTransactionManagerPlugin.js'
export type { NewRelicTransactionManagerOptions } from './plugins/newrelicTransactionManagerPlugin.js'

export {
  openTelemetryTransactionManagerPlugin,
  OpenTelemetryTransactionManager,
} from './plugins/openTelemetryTransactionManagerPlugin.js'
export type { OpenTelemetryTransactionManagerOptions } from './plugins/openTelemetryTransactionManagerPlugin.js'

export {
  datadogTransactionManagerPlugin,
  DatadogTransactionManager,
} from './plugins/datadogTransactionManagerPlugin.js'
export type { DatadogTransactionManagerOptions } from './plugins/datadogTransactionManagerPlugin.js'

export {
  splitIOFeatureManagerPlugin,
  SplitIOFeatureManager,
} from './plugins/splitIOFeatureManagerPlugin.js'
export type { SplitIOOptions } from './plugins/splitIOFeatureManagerPlugin.js'

export {
  healthcheckMetricsPlugin,
  wrapHealthCheckForPrometheus,
} from './plugins/healthcheck/healthcheckMetricsPlugin.js'
export type {
  PrometheusHealthCheck,
  HealthcheckResult,
  HealthcheckMetricsPluginOptions,
} from './plugins/healthcheck/healthcheckMetricsPlugin.js'

export { PrometheusCounterTransactionManager } from './plugins/prometheus/PrometheusCounterTransactionManager.js'

export { bullMqMetricsPlugin } from './plugins/bullMqMetricsPlugin.js'
export type { BullMqMetricsPluginOptions } from './plugins/bullMqMetricsPlugin.js'
export {
  RedisBasedQueueDiscoverer,
  BackgroundJobsBasedQueueDiscoverer,
} from './plugins/bull-mq-metrics/queueDiscoverers.js'
export type { QueueDiscoverer } from './plugins/bull-mq-metrics/queueDiscoverers.js'

export { metricsPlugin } from './plugins/metricsPlugin.js'
export type {
  ErrorObjectResolver,
  MetricsPluginOptions,
} from './plugins/metricsPlugin.js'

export { publicHealthcheckPlugin } from './plugins/healthcheck/publicHealthcheckPlugin.js'
export type {
  PublicHealthcheckPluginOptions,
  HealthCheck,
  InfoProvider,
} from './plugins/healthcheck/publicHealthcheckPlugin.js'

export { wrapHealthCheck } from './plugins/healthcheck/healthcheckCommons.js'
export type { HealthChecker, HealthCheckerSync } from './plugins/healthcheck/healthcheckCommons.js'

export { commonHealthcheckPlugin } from './plugins/healthcheck/commonHealthcheckPlugin.js'
export type { CommonHealthcheckPluginOptions } from './plugins/healthcheck/commonHealthcheckPlugin.js'

export { startupHealthcheckPlugin } from './plugins/healthcheck/startupHealthcheckPlugin.js'
export type { StartupHealthcheckPluginOptions } from './plugins/healthcheck/startupHealthcheckPlugin.js'

export { commonSyncHealthcheckPlugin } from './plugins/healthcheck/commonSyncHealthcheckPlugin.ts'
export type { CommonSyncHealthcheckPluginOptions } from './plugins/healthcheck/commonSyncHealthcheckPlugin.ts'

export {
  amplitudePlugin,
  type AmplitudeConfig,
  type CreateApiTrackingEventFn,
} from './plugins/amplitude/amplitudePlugin.js'
export { Amplitude } from './plugins/amplitude/Amplitude.js'
export { FakeAmplitude } from './plugins/amplitude/FakeAmplitude.js'
export {
  AmplitudeAdapter,
  AMPLITUDE_BASE_MESSAGE_SCHEMA,
  type AmplitudeMessage,
  type AmplitudeAdapterDependencies,
} from './plugins/amplitude/AmplitudeAdapter.js'

export type { FastifyReplyWithPayload } from './types.js'

export { stripTrailingSlashPlugin } from './plugins/stripTrailingSlashPlugin.js'

export {
  unhandledExceptionPlugin,
  commonErrorObjectResolver,
} from './plugins/unhandledExceptionPlugin.js'
export type { UnhandledExceptionPluginOptions } from './plugins/unhandledExceptionPlugin.js'

export { createErrorHandler, isZodError, type ErrorResponseObject } from './errors/errorHandler.js'
export type { ErrorHandlerParams, FreeformRecord } from './errors/errorHandler.js'

export { generateJwtToken, decodeJwtToken } from './jwt-utils/tokenUtils.js'

export { createStaticTokenAuthPreHandler } from './route-utils/authPreHandlers.js'
export {
  getFastifyAppLoggingConfig,
  type AnyFastifyInstance,
  type CommonFastifyInstance,
} from './plugins/pluginsCommon.js'
