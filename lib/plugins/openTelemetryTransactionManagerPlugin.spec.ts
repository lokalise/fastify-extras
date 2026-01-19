import { type Span, SpanStatusCode, trace } from '@opentelemetry/api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OpenTelemetryTransactionManager,
  openTelemetryTransactionManagerPlugin,
} from './openTelemetryTransactionManagerPlugin.js'

describe('openTelemetryTransactionManagerPlugin', () => {
  it('should be a valid fastify plugin', () => {
    expect(openTelemetryTransactionManagerPlugin).toBeDefined()
    expect(typeof openTelemetryTransactionManagerPlugin).toBe('function')
  })
})

describe('OpenTelemetryTransactionManager', () => {
  describe('createDisabled', () => {
    it('should create a disabled manager', () => {
      const manager = OpenTelemetryTransactionManager.createDisabled()

      expect(manager).toBeInstanceOf(OpenTelemetryTransactionManager)
      expect(manager.getSpan('any-key')).toBeNull()

      // Should not throw when used
      manager.start('test', 'key1')
      manager.stop('key1')
    })
  })

  describe('disabled mode', () => {
    it('should not throw errors when disabled', () => {
      const manager = new OpenTelemetryTransactionManager(false)

      manager.start('test-transaction', 'key1')
      manager.addCustomAttribute('attr1', 'value1')
      manager.addCustomAttributes('key1', { attr2: 'value2' })
      manager.setUserID('user-123')
      manager.setControllerName('TestController', 'testAction')
      manager.stop('key1')

      expect(manager.getSpan('key1')).toBeNull()
    })

    it('should not create spans when disabled', () => {
      const manager = new OpenTelemetryTransactionManager(false)

      manager.start('test', 'key1')
      expect(manager.getSpan('key1')).toBeNull()
    })

    it('should execute function normally in runInSpanContext when disabled', () => {
      const manager = new OpenTelemetryTransactionManager(false)
      const result = manager.runInSpanContext('key1', () => 'test-result')
      expect(result).toBe('test-result')
    })
  })

  describe('enabled mode with real tracer', () => {
    let manager: OpenTelemetryTransactionManager

    beforeEach(() => {
      manager = new OpenTelemetryTransactionManager(true, 'test-tracer', '1.0.0')
    })

    it('should start and stop spans without error', () => {
      expect(() => {
        manager.start('my-transaction', 'unique-key')
        manager.stop('unique-key', true)
      }).not.toThrow()
    })

    it('should start span with group and stop without error', () => {
      expect(() => {
        manager.startWithGroup('my-transaction', 'unique-key', 'my-group')
        manager.stop('unique-key', false)
      }).not.toThrow()
    })

    it('should store and retrieve spans by key', () => {
      manager.start('my-transaction', 'unique-key')
      const span = manager.getSpan('unique-key')
      expect(span).not.toBeNull()

      manager.stop('unique-key')
      expect(manager.getSpan('unique-key')).toBeNull()
    })

    it('should return null for non-existent transaction key', () => {
      expect(manager.getSpan('non-existent')).toBeNull()
    })

    it('should not throw when stopping non-existent transaction', () => {
      expect(() => manager.stop('non-existent-key')).not.toThrow()
    })

    it('should not throw when adding attributes to non-existent transaction', () => {
      expect(() => manager.addCustomAttributes('non-existent', { attr: 'value' })).not.toThrow()
    })

    it('should return the tracer', () => {
      expect(manager.getTracer()).toBeDefined()
    })

    it('should add custom attributes to specific span', () => {
      manager.start('my-transaction', 'unique-key')
      expect(() => {
        manager.addCustomAttributes('unique-key', {
          attr1: 'value1',
          attr2: 123,
          attr3: true,
        })
      }).not.toThrow()
      manager.stop('unique-key')
    })

    it('should not throw when using setUserID, setControllerName, addCustomAttribute', () => {
      expect(() => manager.addCustomAttribute('attr', 'value')).not.toThrow()
      expect(() => manager.setUserID('user-123')).not.toThrow()
      expect(() => manager.setControllerName('Controller', 'action')).not.toThrow()
    })

    it('should execute function in runInSpanContext', () => {
      manager.start('my-transaction', 'unique-key')
      const result = manager.runInSpanContext('unique-key', () => 'test-result')
      expect(result).toBe('test-result')
      manager.stop('unique-key')
    })

    it('should execute function in runInSpanContext even without span', () => {
      const result = manager.runInSpanContext('non-existent', () => 'test-result')
      expect(result).toBe('test-result')
    })
  })

  describe('span eviction', () => {
    it('should end evicted spans when capacity is exceeded', () => {
      const mockSpans: Partial<Span>[] = []
      const createMockSpan = () => {
        const span: Partial<Span> = {
          setAttribute: vi.fn(),
          setStatus: vi.fn(),
          end: vi.fn(),
        }
        mockSpans.push(span)
        return span as Span
      }

      const mockTracer = {
        startSpan: vi.fn().mockImplementation(createMockSpan),
      } as unknown as ReturnType<typeof trace.getTracer>

      vi.spyOn(trace, 'getTracer').mockReturnValue(mockTracer)

      // Create manager with capacity of 3
      const manager = new OpenTelemetryTransactionManager(true, 'test-tracer', '1.0.0', 3)

      // Start 3 spans (at capacity)
      manager.start('tx1', 'key1')
      manager.start('tx2', 'key2')
      manager.start('tx3', 'key3')

      expect(mockSpans).toHaveLength(3)
      expect(mockSpans[0]!.end).not.toHaveBeenCalled()

      // Start a 4th span - should evict the oldest (key1)
      manager.start('tx4', 'key4')

      expect(mockSpans).toHaveLength(4)
      // First span should have been ended with error status
      expect(mockSpans[0]!.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Span evicted due to capacity limits',
      })
      expect(mockSpans[0]!.end).toHaveBeenCalled()

      // key1 should no longer be retrievable
      expect(manager.getSpan('key1')).toBeNull()

      // key4 should be retrievable
      expect(manager.getSpan('key4')).toBe(mockSpans[3]!)

      vi.restoreAllMocks()
    })

    it('should end existing span when updating with same key', () => {
      const mockSpans: Partial<Span>[] = []
      const createMockSpan = () => {
        const span: Partial<Span> = {
          setAttribute: vi.fn(),
          setStatus: vi.fn(),
          end: vi.fn(),
        }
        mockSpans.push(span)
        return span as Span
      }

      const mockTracer = {
        startSpan: vi.fn().mockImplementation(createMockSpan),
      } as unknown as ReturnType<typeof trace.getTracer>

      vi.spyOn(trace, 'getTracer').mockReturnValue(mockTracer)

      // Create manager with capacity of 2
      const manager = new OpenTelemetryTransactionManager(true, 'test-tracer', '1.0.0', 2)

      // Start 2 spans (at capacity)
      manager.start('tx1', 'key1')
      manager.start('tx2', 'key2')

      // Update key1 with a new span - should end the existing span but not evict
      manager.start('tx1-updated', 'key1')

      // First span (key1) should have been ended with OK status (replaced)
      expect(mockSpans[0]!.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
        message: 'Span replaced with new span for same key',
      })
      expect(mockSpans[0]!.end).toHaveBeenCalled()

      // Second span (key2) should not have been ended
      expect(mockSpans[1]!.end).not.toHaveBeenCalled()

      // The new span (third one) should be retrievable via key1
      expect(manager.getSpan('key1')).toBe(mockSpans[2]!)

      vi.restoreAllMocks()
    })

    it('should use custom maxConcurrentSpans', () => {
      const manager = new OpenTelemetryTransactionManager(true, 'test-tracer', '1.0.0', 5)

      // Should be able to store 5 spans
      for (let i = 0; i < 5; i++) {
        manager.start(`tx${i}`, `key${i}`)
      }

      // All 5 should be retrievable
      for (let i = 0; i < 5; i++) {
        expect(manager.getSpan(`key${i}`)).not.toBeNull()
      }
    })
  })

  describe('enabled mode with mocks', () => {
    let manager: OpenTelemetryTransactionManager
    let mockSpan: Partial<Span>
    let mockTracer: ReturnType<typeof trace.getTracer>

    beforeEach(() => {
      mockSpan = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      }

      mockTracer = {
        startSpan: vi.fn().mockReturnValue(mockSpan),
      } as unknown as ReturnType<typeof trace.getTracer>

      vi.spyOn(trace, 'getTracer').mockReturnValue(mockTracer)
      vi.spyOn(trace, 'getActiveSpan').mockReturnValue(mockSpan as Span)

      manager = new OpenTelemetryTransactionManager(true, 'test-tracer', '1.0.0')
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should create a tracer with correct tracer name and version', () => {
      expect(trace.getTracer).toHaveBeenCalledWith('test-tracer', '1.0.0')
    })

    it('should start a span with correct name and attributes', () => {
      manager.start('my-transaction', 'unique-key')

      expect(mockTracer.startSpan).toHaveBeenCalledWith('my-transaction', {
        attributes: {
          'transaction.type': 'background',
        },
      })
    })

    it('should start a span with group attribute', () => {
      manager.startWithGroup('my-transaction', 'unique-key', 'my-group')

      expect(mockTracer.startSpan).toHaveBeenCalledWith('my-transaction', {
        attributes: {
          'transaction.type': 'background',
          'transaction.group': 'my-group',
        },
      })
    })

    it('should stop a span with OK status when successful', () => {
      manager.start('my-transaction', 'unique-key')
      manager.stop('unique-key', true)

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK })
      expect(mockSpan.end).toHaveBeenCalled()
    })

    it('should stop a span with ERROR status when not successful', () => {
      manager.start('my-transaction', 'unique-key')
      manager.stop('unique-key', false)

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR })
      expect(mockSpan.end).toHaveBeenCalled()
    })

    it('should default to successful when stopping', () => {
      manager.start('my-transaction', 'unique-key')
      manager.stop('unique-key')

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK })
    })

    it('should add custom attribute to active span', () => {
      manager.addCustomAttribute('my-attr', 'my-value')

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('my-attr', 'my-value')
    })

    it('should add custom attributes to specific span', () => {
      manager.start('my-transaction', 'unique-key')
      manager.addCustomAttributes('unique-key', {
        attr1: 'value1',
        attr2: 123,
        attr3: true,
      })

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('attr1', 'value1')
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('attr2', 123)
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('attr3', true)
    })

    it('should set user ID on active span', () => {
      manager.setUserID('user-456')

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('enduser.id', 'user-456')
    })

    it('should set controller name on active span', () => {
      manager.setControllerName('MyController', 'myAction')

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('code.namespace', 'MyController')
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('code.function', 'myAction')
    })

    it('should return span by transaction key', () => {
      manager.start('my-transaction', 'unique-key')
      const span = manager.getSpan('unique-key')

      expect(span).toBe(mockSpan)
    })

    it('should return the tracer', () => {
      expect(manager.getTracer()).toBe(mockTracer)
    })

    it('should remove span from map after stopping', () => {
      manager.start('my-transaction', 'unique-key')
      expect(manager.getSpan('unique-key')).toBe(mockSpan)

      manager.stop('unique-key')
      expect(manager.getSpan('unique-key')).toBeNull()
    })
  })

  describe('addCustomAttribute without active span', () => {
    beforeEach(() => {
      vi.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should not throw when no active span', () => {
      const manager = new OpenTelemetryTransactionManager(true)

      expect(() => manager.addCustomAttribute('attr', 'value')).not.toThrow()
      expect(() => manager.setUserID('user-123')).not.toThrow()
      expect(() => manager.setControllerName('Controller', 'action')).not.toThrow()
    })
  })
})
