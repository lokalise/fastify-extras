export { bugsnagPlugin, reportErrorToBugsnag } from './plugins/bugsnagPlugin'
export type { ErrorReport } from './plugins/bugsnagPlugin'

export {
  requestContextProviderPlugin,
  getRequestIdFastifyAppConfig,
} from './plugins/requestContextProviderPlugin'
export type { RequestContext } from './plugins/requestContextProviderPlugin'

export { newrelicTransactionManagerPlugin } from './plugins/newrelicTransactionManagerPlugin'
export type {
  NewRelicTransactionManager,
  NewRelicTransactionManagerOptions,
} from './plugins/newrelicTransactionManagerPlugin'
