export { bugsnagPlugin, reportErrorToBugsnag } from './plugins/bugsnagPlugin'
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

export { healthcheckMetricsPlugin } from './plugins/healthcheckMetricsPlugin'
export type {
  PrometheusHealthCheck,
  HealthcheckResult,
  HealthcheckMetricsPluginOptions,
} from './plugins/healthcheckMetricsPlugin'

export { metricsPlugin } from './plugins/metricsPlugin'
export type { ErrorObjectResolver, MetricsPluginOptions } from './plugins/metricsPlugin'

export { prismaOtelTracingPlugin } from './plugins/opentelemetry/prismaOtelTracingPlugin'
export type { PrismaOtelTracingPluginConfig } from './plugins/opentelemetry/prismaOtelTracingPlugin'

export { publicHealthcheckPlugin } from './plugins/publicHealthcheckPlugin'
export type {
  PublicHealthcheckPluginOptions,
  HealthCheck,
  HealthChecker,
} from './plugins/publicHealthcheckPlugin'

export {
  amplitudePlugin,
  Amplitude,
  type AmplitudeConfig,
  type CreateApiTrackingEventFn,
} from './plugins/amplitudePlugin'

export type { FastifyReplyWithPayload } from './types'
