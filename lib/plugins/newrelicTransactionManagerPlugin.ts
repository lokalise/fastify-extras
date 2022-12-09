import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import type { TransactionHandle } from 'newrelic'
import { getTransaction, startBackgroundTransaction, shutdown } from 'newrelic'

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
    this.isEnabled = isNewRelicEnabled
    this.transactionMap = new Map()
  }

  public start(jobName: string): void {
    if (!this.isEnabled) {
      return
    }

    startBackgroundTransaction(jobName, () => {
      this.transactionMap.set(jobName, getTransaction())
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

  fastify.addHook('onClose', async () => {
    return new Promise((resolve, reject) => {
      shutdown((error) => {
        if (error) {
          return reject(error)
        }
        resolve()
      })
    })
  })

  done()
}

export const newrelicTransactionManagerPlugin = fp(plugin, {
  fastify: '4.x',
  name: 'newrelic-transaction-manager-plugin',
})
