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

export { metricsPlugin } from './plugins/metricsPlugin'
export type { ErrorObjectResolver, MetricsPluginOptions } from './plugins/metricsPlugin'

export { prismaOtelTracingPlugin } from './plugins/opentelemetry/prismaOtelTracingPlugin'
export type { PrismaOtelTracingPluginConfig } from './plugins/opentelemetry/prismaOtelTracingPlugin'
