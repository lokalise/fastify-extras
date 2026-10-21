export type { ErrorHandlerParams, FreeformRecord } from './errors/errorHandler.ts'
export {
  createErrorHandler,
  defaultResolveResponseObject,
  type ErrorResponseObject,
  isZodError,
} from './errors/errorHandler.ts'
export { decodeJwtToken, generateJwtToken } from './jwt-utils/tokenUtils.ts'
export { Amplitude } from './plugins/amplitude/Amplitude.ts'
export {
  AMPLITUDE_BASE_MESSAGE_SCHEMA,
  AmplitudeAdapter,
  type AmplitudeAdapterDependencies,
  type AmplitudeMessage,
} from './plugins/amplitude/AmplitudeAdapter.ts'
export {
  type AmplitudeConfig,
  amplitudePlugin,
  type CreateApiTrackingEventFn,
} from './plugins/amplitude/amplitudePlugin.ts'
export { FakeAmplitude } from './plugins/amplitude/FakeAmplitude.ts'
export * from './plugins/api-visibility/index.ts'
export type { BugsnagConfig, ErrorReport } from './plugins/bugsnagPlugin.ts'
export {
  addFeatureFlag,
  bugsnagErrorReporter,
  bugsnagPlugin,
  reportErrorToBugsnag,
} from './plugins/bugsnagPlugin.ts'
export type { QueueDiscoverer } from './plugins/bull-mq-metrics/queueDiscoverers.ts'
export {
  BackgroundJobsBasedQueueDiscoverer,
  RedisBasedQueueDiscoverer,
} from './plugins/bull-mq-metrics/queueDiscoverers.ts'
export type { BullMqMetricsPluginOptions } from './plugins/bullMqMetricsPlugin.ts'

export { bullMqMetricsPlugin } from './plugins/bullMqMetricsPlugin.ts'
export type { DatadogTransactionManagerOptions } from './plugins/datadogTransactionManagerPlugin.ts'
export {
  DatadogTransactionManager,
  datadogTransactionManagerPlugin,
} from './plugins/datadogTransactionManagerPlugin.ts'
export type { CommonHealthcheckPluginOptions } from './plugins/healthcheck/commonHealthcheckPlugin.ts'
export { commonHealthcheckPlugin } from './plugins/healthcheck/commonHealthcheckPlugin.ts'
export type { CommonSyncHealthcheckPluginOptions } from './plugins/healthcheck/commonSyncHealthcheckPlugin.ts'
export { commonSyncHealthcheckPlugin } from './plugins/healthcheck/commonSyncHealthcheckPlugin.ts'
export type { HealthChecker, HealthCheckerSync } from './plugins/healthcheck/healthcheckCommons.ts'

export { wrapHealthCheck } from './plugins/healthcheck/healthcheckCommons.ts'
export type {
  HealthcheckMetricsPluginOptions,
  HealthcheckResult,
  PrometheusHealthCheck,
} from './plugins/healthcheck/healthcheckMetricsPlugin.ts'
export {
  healthcheckMetricsPlugin,
  wrapHealthCheckForPrometheus,
} from './plugins/healthcheck/healthcheckMetricsPlugin.ts'
export type {
  HealthCheck,
  InfoProvider,
  PublicHealthcheckPluginOptions,
} from './plugins/healthcheck/publicHealthcheckPlugin.ts'
export { publicHealthcheckPlugin } from './plugins/healthcheck/publicHealthcheckPlugin.ts'
export type { StartupHealthcheckPluginOptions } from './plugins/healthcheck/startupHealthcheckPlugin.ts'
export { startupHealthcheckPlugin } from './plugins/healthcheck/startupHealthcheckPlugin.ts'
export type {
  ErrorObjectResolver,
  MetricsPluginOptions,
} from './plugins/metricsPlugin.ts'
export { metricsPlugin } from './plugins/metricsPlugin.ts'
export {
  type ApiDocumentationAudience,
  type ApiDocumentationHooks,
  type ApiDocumentationPluginOptions,
  type ApiDocumentationTransform,
  type ApiDocumentationTransformInput,
  type ApiDocumentationTransformOptions,
  type ApiDocumentationTransformResult,
  apiDocumentationPlugin,
  apiDocumentationTransform,
  type ChainedApiDocumentationTransform,
  type ChainedApiDocumentationTransformObject,
  DEFAULT_HIDDEN_ROUTES,
  DEFAULT_INTERNAL_MARKER_KEY,
  type DocumentationRouteMatcher,
  type DocumentedRoute,
  type OpenApiDocumentDefinition,
  type OpenApiDocumentLike,
  type OpenApiRouteSchema,
  pruneUnreachableComponents,
  pruneUnreferencedTags,
} from './plugins/openapi/index.ts'
export type { OpenTelemetryTransactionManagerOptions } from './plugins/openTelemetryTransactionManagerPlugin.ts'
export {
  OpenTelemetryTransactionManager,
  openTelemetryTransactionManagerPlugin,
} from './plugins/openTelemetryTransactionManagerPlugin.ts'
export {
  type AnyFastifyInstance,
  type CommonFastifyInstance,
  getFastifyAppLoggingConfig,
} from './plugins/pluginsCommon.ts'
export { PrometheusCounterTransactionManager } from './plugins/prometheus/PrometheusCounterTransactionManager.ts'
export type { BaseRequestContext as RequestContext } from './plugins/requestContextProviderPlugin.ts'
export {
  getRequestIdFastifyAppConfig,
  requestContextProviderPlugin,
} from './plugins/requestContextProviderPlugin.ts'
export type { SplitIOOptions } from './plugins/splitIOFeatureManagerPlugin.ts'
export {
  SplitIOFeatureManager,
  splitIOFeatureManagerPlugin,
} from './plugins/splitIOFeatureManagerPlugin.ts'
export { stripTrailingSlashPlugin } from './plugins/stripTrailingSlashPlugin.ts'
export type { UnhandledExceptionPluginOptions } from './plugins/unhandledExceptionPlugin.ts'
export {
  commonErrorObjectResolver,
  unhandledExceptionPlugin,
} from './plugins/unhandledExceptionPlugin.ts'
export { createStaticTokenAuthPreHandler } from './route-utils/authPreHandlers.ts'
export type { FastifyReplyWithPayload } from './types.ts'
