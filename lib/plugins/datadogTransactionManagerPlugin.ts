import type { TransactionObservabilityManager } from '@lokalise/node-core'
import tracer, { type Span } from 'dd-trace'
import type { FastifyInstance, FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'
import { FifoMap } from 'toad-cache'

declare module 'fastify' {
  interface FastifyInstance {
    datadogTransactionManager: DatadogTransactionManager
  }
}

export interface DatadogTransactionManagerOptions {
  isEnabled: boolean
}

export class DatadogTransactionManager implements TransactionObservabilityManager {
  private readonly isEnabled: boolean
  private readonly spanMap: FifoMap<Span>

  constructor(isEnabled: boolean) {
    this.isEnabled = isEnabled
    this.spanMap = new FifoMap(2000)
  }

  public static createDisabled(): DatadogTransactionManager {
    return new DatadogTransactionManager(false)
  }

  /**
   * @param transactionName - used for grouping similar transactions together
   * @param uniqueTransactionKey - used for identifying specific ongoing transaction. Must be reasonably unique to reduce possibility of collisions
   */
  public start(transactionName: string, uniqueTransactionKey: string): void {
    if (!this.isEnabled) return

    const span = tracer.startSpan(transactionName, {
      tags: {
        'transaction.type': 'background',
      },
    })
    this.spanMap.set(uniqueTransactionKey, span)
  }

  /**
   * @param transactionName - used for grouping similar transactions together
   * @param uniqueTransactionKey - used for identifying specific ongoing transaction. Must be reasonably unique to reduce possibility of collisions
   * @param transactionGroup - group is used for grouping related transactions with different names
   */
  public startWithGroup(
    transactionName: string,
    uniqueTransactionKey: string,
    transactionGroup: string,
  ): void {
    if (!this.isEnabled) return

    const span = tracer.startSpan(transactionName, {
      tags: {
        'transaction.type': 'background',
        'transaction.group': transactionGroup,
      },
    })
    this.spanMap.set(uniqueTransactionKey, span)
  }

  public stop(uniqueTransactionKey: string): void {
    if (!this.isEnabled) return

    const span = this.spanMap.get(uniqueTransactionKey) ?? null
    if (!span) return

    span.finish()
    this.spanMap.delete(uniqueTransactionKey)
  }

  public addCustomAttribute(attrName: string, attrValue: string | number | boolean): void {
    if (!this.isEnabled) return

    const activeSpan = tracer.scope().active()
    if (activeSpan) {
      activeSpan.setTag(attrName, attrValue)
    }
  }

  public addCustomAttributes(
    uniqueTransactionKey: string,
    atts: { [p: string]: string | number | boolean },
  ): void {
    if (!this.isEnabled) return

    const span = this.spanMap.get(uniqueTransactionKey)
    if (!span) return

    span.addTags(atts)
  }

  public setUserID(userId: string): void {
    if (!this.isEnabled) return

    const activeSpan = tracer.scope().active()
    if (activeSpan) {
      activeSpan.setTag('usr.id', userId)
    }
  }

  public setControllerName(name: string, action: string): void {
    if (!this.isEnabled) return

    const activeSpan = tracer.scope().active()
    if (activeSpan) {
      activeSpan.setTag('code.namespace', name)
      activeSpan.setTag('code.function', action)
    }
  }
}

function plugin(fastify: FastifyInstance, opts: DatadogTransactionManagerOptions) {
  const manager = new DatadogTransactionManager(opts.isEnabled)
  fastify.decorate('datadogTransactionManager', manager)
}

export const datadogTransactionManagerPlugin: FastifyPluginCallback<DatadogTransactionManagerOptions> =
  fp(plugin, {
    fastify: '5.x',
    name: 'datadog-transaction-manager-plugin',
  })
