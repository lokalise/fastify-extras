import type { TransactionObservabilityManager } from '@lokalise/node-core'
import type { Span, Tracer } from '@opentelemetry/api'
import { SpanStatusCode, context, trace } from '@opentelemetry/api'
import type { FastifyInstance, FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'
import { FifoMap } from 'toad-cache'

declare module 'fastify' {
  interface FastifyInstance {
    openTelemetryTransactionManager: OpenTelemetryTransactionManager
  }
}

export interface OpenTelemetryTransactionManagerOptions {
  isEnabled: boolean
  serviceName?: string
  serviceVersion?: string
}

export class OpenTelemetryTransactionManager implements TransactionObservabilityManager {
  private readonly isEnabled: boolean
  private readonly tracer: Tracer
  private readonly spanMap: FifoMap<Span>

  constructor(isEnabled: boolean, serviceName = 'unknown-service', serviceVersion = '1.0.0') {
    this.isEnabled = isEnabled
    this.tracer = trace.getTracer(serviceName, serviceVersion)
    this.spanMap = new FifoMap(2000)
  }

  public static createDisabled(): OpenTelemetryTransactionManager {
    return new OpenTelemetryTransactionManager(false)
  }

  /**
   * @param transactionName - used for grouping similar transactions together
   * @param uniqueTransactionKey - used for identifying specific ongoing transaction. Must be reasonably unique to reduce possibility of collisions
   */
  public start(transactionName: string, uniqueTransactionKey: string): void {
    if (!this.isEnabled) return

    const span = this.tracer.startSpan(transactionName, {
      attributes: {
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

    const span = this.tracer.startSpan(transactionName, {
      attributes: {
        'transaction.type': 'background',
        'transaction.group': transactionGroup,
      },
    })
    this.spanMap.set(uniqueTransactionKey, span)
  }

  public stop(uniqueTransactionKey: string, wasSuccessful = true): void {
    if (!this.isEnabled) return

    const span = this.spanMap.get(uniqueTransactionKey) ?? null
    if (!span) return

    if (!wasSuccessful) {
      span.setStatus({ code: SpanStatusCode.ERROR })
    } else {
      span.setStatus({ code: SpanStatusCode.OK })
    }

    span.end()
    this.spanMap.delete(uniqueTransactionKey)
  }

  public addCustomAttribute(attrName: string, attrValue: string | number | boolean): void {
    if (!this.isEnabled) return

    const activeSpan = trace.getActiveSpan()
    if (activeSpan) {
      activeSpan.setAttribute(attrName, attrValue)
    }
  }

  public addCustomAttributes(
    uniqueTransactionKey: string,
    atts: { [p: string]: string | number | boolean },
  ): void {
    if (!this.isEnabled) return

    const span = this.spanMap.get(uniqueTransactionKey)
    if (!span) return

    for (const [key, value] of Object.entries(atts)) {
      span.setAttribute(key, value)
    }
  }

  public setUserID(userId: string): void {
    if (!this.isEnabled) return

    const activeSpan = trace.getActiveSpan()
    if (activeSpan) {
      activeSpan.setAttribute('enduser.id', userId)
    }
  }

  public setControllerName(name: string, action: string): void {
    if (!this.isEnabled) return

    const activeSpan = trace.getActiveSpan()
    if (activeSpan) {
      activeSpan.setAttribute('code.namespace', name)
      activeSpan.setAttribute('code.function', action)
    }
  }

  /**
   * Get a span by its unique transaction key. Useful for advanced use cases
   * where direct span manipulation is needed.
   */
  public getSpan(uniqueTransactionKey: string): Span | null {
    if (!this.isEnabled) return null
    return this.spanMap.get(uniqueTransactionKey) ?? null
  }

  /**
   * Get the underlying tracer for advanced use cases.
   */
  public getTracer(): Tracer {
    return this.tracer
  }

  /**
   * Run a function within the context of a specific span.
   * Useful when you need child spans to be automatically linked to a parent.
   */
  public runInSpanContext<T>(uniqueTransactionKey: string, fn: () => T): T {
    if (!this.isEnabled) return fn()

    const span = this.spanMap.get(uniqueTransactionKey)
    if (!span) return fn()

    return context.with(trace.setSpan(context.active(), span), fn)
  }
}

function plugin(fastify: FastifyInstance, opts: OpenTelemetryTransactionManagerOptions) {
  const manager = new OpenTelemetryTransactionManager(
    opts.isEnabled,
    opts.serviceName,
    opts.serviceVersion,
  )
  fastify.decorate('openTelemetryTransactionManager', manager)
}

export const openTelemetryTransactionManagerPlugin: FastifyPluginCallback<OpenTelemetryTransactionManagerOptions> =
  fp(plugin, {
    fastify: '5.x',
    name: 'opentelemetry-transaction-manager-plugin',
  })
