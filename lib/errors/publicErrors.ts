import type { OptionalMessageErrorParams } from '@lokalise/node-core'
import { PublicNonRecoverableError } from '@lokalise/node-core'

export class EmptyTokenError extends PublicNonRecoverableError {
  constructor(params: OptionalMessageErrorParams = {}) {
    super({
      message: params.message ?? 'Empty token',
      errorCode: 'EMPTY_TOKEN',
      httpStatusCode: 401,
      details: params.details,
    })
  }
}
