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
  /**
   * The name used to identify the tracer (instrumentation scope name).
   * This is NOT the OpenTelemetry resource `service.name` attribute.
   * To set the service name for your traces, configure it via the OpenTelemetry SDK
   * resource configuration (e.g., OTEL_SERVICE_NAME environment variable or SDK Resource).
   * @default 'unknown-tracer'
   */
  tracerName?: string
  /**
   * The version used to identify the tracer (instrumentation scope version).
   * This is NOT the OpenTelemetry resource `service.version` attribute.
   * To set the service version for your traces, configure it via the OpenTelemetry SDK
   * resource configuration.
   * @default '1.0.0'
   */
  tracerVersion?: string
  /**
   * Maximum number of concurrent spans to track. When this limit is reached,
   * the oldest spans will be evicted and automatically ended to prevent leaks.
   * @default 2000
   */
  maxConcurrentSpans?: number
}

/**
 * A FIFO map that automatically ends spans when they are evicted due to capacity limits.
 * This prevents span leaks when the map reaches its maximum size.
 */
class EvictingSpanMap {
  private readonly map: FifoMap<Span>
  private readonly maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
    this.map = new FifoMap(maxSize)
  }

  set(key: string, span: Span): void {
    // Check if key already exists (update case - end existing span to prevent leaks)
    const existingSpan = this.map.get(key)
    if (existingSpan !== undefined) {
      existingSpan.setStatus({
        code: SpanStatusCode.OK,
        message: 'Span replaced with new span for same key',
      })
      existingSpan.end()
      this.map.set(key, span)
      return
    }

    // Check if we're at capacity and will evict
    if (this.map.size >= this.maxSize) {
      // FifoMap evicts the oldest entry when at capacity
      // We need to end that span before it gets evicted
      const oldestKey = this.getOldestKey()
      if (oldestKey) {
        const evictedSpan = this.map.get(oldestKey)
        if (evictedSpan) {
          // End the span with an error status to indicate it was evicted
          evictedSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Span evicted due to capacity limits',
          })
          evictedSpan.end()
        }
      }
    }
    this.map.set(key, span)
  }

  get(key: string): Span | undefined {
    return this.map.get(key)
  }

  delete(key: string): void {
    this.map.delete(key)
  }

  /**
   * Get the oldest key in the map (first to be evicted).
   * FifoMap stores keys in insertion order, so we iterate to find the first one.
   */
  private getOldestKey(): string | undefined {
    // FifoMap internally uses a linked list structure with first/last pointers
    // We access the internal structure to find the oldest key
    // biome-ignore lint/suspicious/noExplicitAny: Accessing internal FifoMap structure
    const internal = this.map as any
    if (internal.first) {
      return internal.first.key
    }
    return undefined
  }
}

export class OpenTelemetryTransactionManager implements TransactionObservabilityManager {
  private readonly isEnabled: boolean
  private readonly tracer: Tracer
  private readonly spanMap: EvictingSpanMap

  /**
   * Creates a new OpenTelemetryTransactionManager.
   *
   * @param isEnabled - Whether tracing is enabled
   * @param tracerName - The instrumentation scope name for the tracer. This identifies
   *   the instrumentation library, not the service. Service identification should be
   *   configured via OpenTelemetry SDK resource attributes (e.g., OTEL_SERVICE_NAME).
   * @param tracerVersion - The instrumentation scope version for the tracer.
   * @param maxConcurrentSpans - Maximum number of concurrent spans to track before eviction.
   */
  constructor(
    isEnabled: boolean,
    tracerName = 'unknown-tracer',
    tracerVersion = '1.0.0',
    maxConcurrentSpans = 2000,
  ) {
    this.isEnabled = isEnabled
    this.tracer = trace.getTracer(tracerName, tracerVersion)
    this.spanMap = new EvictingSpanMap(maxConcurrentSpans)
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
    opts.tracerName,
    opts.tracerVersion,
    opts.maxConcurrentSpans,
  )
  fastify.decorate('openTelemetryTransactionManager', manager)
}

export const openTelemetryTransactionManagerPlugin: FastifyPluginCallback<OpenTelemetryTransactionManagerOptions> =
  fp(plugin, {
    fastify: '5.x',
    name: 'opentelemetry-transaction-manager-plugin',
  })
