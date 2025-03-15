import type { TransactionObservabilityManager } from '@lokalise/node-core'
import type { FastifyInstance, FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'
import type {
  getTransaction as GetTransaction,
  shutdown as Shutdown,
  TransactionHandle,
  startBackgroundTransaction as startBackgroundTransactionType,
} from 'newrelic'
import { FifoMap } from 'toad-cache'

interface Newrelic {
  startBackgroundTransaction: typeof startBackgroundTransactionType
  shutdown: typeof Shutdown
  getTransaction: typeof GetTransaction
  addCustomAttribute(key: string, value: string | number | boolean): void
  addCustomAttributes(atts: { [key: string]: string | number | boolean }): void
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

export class NewRelicTransactionManager implements TransactionObservabilityManager {
  private readonly isEnabled: boolean
  private readonly transactionMap: FifoMap<TransactionHandle>

  private constructor(isNewRelicEnabled: boolean) {
    this.isEnabled = isNewRelicEnabled
    this.transactionMap = new FifoMap(2000)
  }

  public static async create(isNewRelicEnabled: boolean): Promise<NewRelicTransactionManager> {
    if (isNewRelicEnabled) {
      // @ts-ignore
      newrelic = await import('newrelic')
    }

    return new NewRelicTransactionManager(isNewRelicEnabled)
  }

  public addCustomAttribute(attrName: string, attrValue: string | number | boolean) {
    if (!this.isEnabled) {
      return
    }

    newrelic.addCustomAttribute(attrName, attrValue)
  }

  public addCustomAttributes(
    _uniqueTransactionKey: string,
    atts: { [p: string]: string | number | boolean },
  ): void {
    if (!this.isEnabled) {
      return
    }

    newrelic.addCustomAttributes(atts)
  }

  /**
   * @param transactionName - used for grouping similar transactions together
   * @param uniqueTransactionKey - used for identifying specific ongoing transaction. Must be reasonably unique to reduce possibility of collisions
   */
  public start(transactionName: string, uniqueTransactionKey: string): void {
    if (!this.isEnabled) {
      return
    }

    newrelic.startBackgroundTransaction(transactionName, () => {
      this.transactionMap.set(uniqueTransactionKey, newrelic.getTransaction())
    })
  }

  /**
   * @param transactionName - used for grouping similar transactions together
   * @param uniqueTransactionKey - used for identifying specific ongoing transaction. Must be reasonably unique to reduce possibility of collisions   *
   * @param transactionGroup - group is used for grouping related transactions with different names
   */
  public startWithGroup(
    transactionName: string,
    uniqueTransactionKey: string,
    transactionGroup: string,
  ): void {
    if (!this.isEnabled) {
      return
    }

    newrelic.startBackgroundTransaction(transactionName, transactionGroup, () => {
      this.transactionMap.set(uniqueTransactionKey, newrelic.getTransaction())
    })
  }

  public stop(uniqueTransactionKey: string): void {
    if (!this.isEnabled) {
      return
    }

    const transaction = this.transactionMap.get(uniqueTransactionKey) ?? null
    if (!transaction) {
      return
    }
    transaction.end()
    this.transactionMap.delete(uniqueTransactionKey)
  }
}

async function plugin(
  fastify: FastifyInstance,
  opts: NewRelicTransactionManagerOptions,
) {
  const manager = await NewRelicTransactionManager.create(opts.isEnabled)
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
}

export const newrelicTransactionManagerPlugin: FastifyPluginCallback<NewRelicTransactionManagerOptions> =
  fp(plugin, {
    fastify: '5.x',
    name: 'newrelic-transaction-manager-plugin',
  })
