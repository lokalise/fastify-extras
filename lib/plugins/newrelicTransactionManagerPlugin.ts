import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import type {
  TransactionHandle,
  startBackgroundTransaction as startBackgroundTransactionType,
  shutdown as Shutdown,
  getTransaction as GetTransaction,
} from 'newrelic'

interface Newrelic {
  startBackgroundTransaction: typeof startBackgroundTransactionType
  shutdown: typeof Shutdown
  getTransaction: typeof GetTransaction
  addCustomAttribute(key: string, value: string | number | boolean): void
}

let newrelic: Newrelic

declare module 'fastify' {
  interface FastifyInstance {
    newrelicTransactionManager: NewRelicTransactionManager
  }
}

export interface NewRelicTransactionManagerOptions {
  isEnabled: boolean
}

export class NewRelicTransactionManager {
  private readonly isEnabled: boolean
  private readonly transactionMap: Map<string, TransactionHandle>

  constructor(isNewRelicEnabled: boolean) {
    if (isNewRelicEnabled) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      newrelic = require('newrelic')
    }

    this.isEnabled = isNewRelicEnabled
    this.transactionMap = new Map()
  }

  public addCustomAttribute(attrName: string, attrValue: string | number | boolean) {
    if (!this.isEnabled) {
      return
    }

    newrelic.addCustomAttribute(attrName, attrValue)
  }

  public start(jobName: string): void {
    if (!this.isEnabled) {
      return
    }

    newrelic.startBackgroundTransaction(jobName, () => {
      this.transactionMap.set(jobName, newrelic.getTransaction())
    })
  }

  public stop(jobId: string): void {
    if (!this.isEnabled) {
      return
    }

    const transaction = this.transactionMap.get(jobId) ?? null
    if (null === transaction) {
      return
    }
    transaction.end()
    this.transactionMap.delete(jobId)
  }
}

function plugin(
  fastify: FastifyInstance,
  opts: NewRelicTransactionManagerOptions,
  done: () => void,
) {
  const manager = new NewRelicTransactionManager(opts.isEnabled)

  fastify.decorate('newrelicTransactionManager', manager)

  if (opts.isEnabled) {
    fastify.addHook('onClose', async () => {
      return new Promise((resolve, reject) => {
        newrelic.shutdown((error) => {
          if (error) {
            return reject(error)
          }
          resolve()
        })
      })
    })
  }

  done()
}

export const newrelicTransactionManagerPlugin = fp(plugin, {
  fastify: '4.x',
  name: 'newrelic-transaction-manager-plugin',
})
