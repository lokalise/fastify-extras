import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSpan, mockTracer } = vi.hoisted(() => {
  const mockSpan = {
    setTag: vi.fn().mockReturnThis(),
    addTags: vi.fn().mockReturnThis(),
    finish: vi.fn(),
  }

  const mockTracer = {
    startSpan: vi.fn().mockReturnValue(mockSpan),
    scope: vi.fn().mockReturnValue({
      active: vi.fn().mockReturnValue(mockSpan),
    }),
  }

  return { mockSpan, mockTracer }
})

vi.mock('dd-trace', () => ({
  default: mockTracer,
}))

import {
  DatadogTransactionManager,
  datadogTransactionManagerPlugin,
} from './datadogTransactionManagerPlugin.js'

describe('datadogTransactionManagerPlugin', () => {
  it('should be a valid fastify plugin', () => {
    expect(datadogTransactionManagerPlugin).toBeDefined()
    expect(typeof datadogTransactionManagerPlugin).toBe('function')
  })
})

describe('DatadogTransactionManager', () => {
  describe('createDisabled', () => {
    it('should create a disabled manager', () => {
      const manager = DatadogTransactionManager.createDisabled()

      expect(manager).toBeInstanceOf(DatadogTransactionManager)

      // Should not throw when used
      manager.start('test', 'key1')
      manager.stop('key1')
    })
  })

  describe('disabled mode', () => {
    it('should not throw errors when disabled', () => {
      const manager = new DatadogTransactionManager(false)

      manager.start('test-transaction', 'key1')
      manager.addCustomAttribute('attr1', 'value1')
      manager.addCustomAttributes('key1', { attr2: 'value2' })
      manager.setUserID('user-123')
      manager.setControllerName('TestController', 'testAction')
      manager.stop('key1')
    })

    it('should not create spans when disabled', () => {
      const manager = new DatadogTransactionManager(false)

      manager.start('test', 'key1')
      expect(mockTracer.startSpan).not.toHaveBeenCalled()
    })
  })

  describe('enabled mode', () => {
    let manager: DatadogTransactionManager

    beforeEach(() => {
      vi.clearAllMocks()
      mockSpan.setTag.mockReturnThis()
      mockSpan.addTags.mockReturnThis()
      mockTracer.startSpan.mockReturnValue(mockSpan)
      mockTracer.scope.mockReturnValue({
        active: vi.fn().mockReturnValue(mockSpan),
      })
      manager = new DatadogTransactionManager(true)
    })

    it('should start a span with correct name and tags', () => {
      manager.start('my-transaction', 'unique-key')

      expect(mockTracer.startSpan).toHaveBeenCalledWith('my-transaction', {
        tags: {
          'transaction.type': 'background',
        },
      })
    })

    it('should start a span with group tag', () => {
      manager.startWithGroup('my-transaction', 'unique-key', 'my-group')

      expect(mockTracer.startSpan).toHaveBeenCalledWith('my-transaction', {
        tags: {
          'transaction.type': 'background',
          'transaction.group': 'my-group',
        },
      })
    })

    it('should stop a span by calling finish', () => {
      manager.start('my-transaction', 'unique-key')
      manager.stop('unique-key')

      expect(mockSpan.finish).toHaveBeenCalled()
    })

    it('should not throw when stopping non-existent transaction', () => {
      expect(() => manager.stop('non-existent-key')).not.toThrow()
      expect(mockSpan.finish).not.toHaveBeenCalled()
    })

    it('should add custom attribute to active span', () => {
      manager.addCustomAttribute('my-attr', 'my-value')

      expect(mockTracer.scope).toHaveBeenCalled()
      expect(mockSpan.setTag).toHaveBeenCalledWith('my-attr', 'my-value')
    })

    it('should add custom attributes to specific span via addTags', () => {
      manager.start('my-transaction', 'unique-key')

      const attrs = { attr1: 'value1', attr2: 123, attr3: true }
      manager.addCustomAttributes('unique-key', attrs)

      expect(mockSpan.addTags).toHaveBeenCalledWith(attrs)
    })

    it('should not throw when adding attributes to non-existent transaction', () => {
      expect(() => manager.addCustomAttributes('non-existent', { attr: 'value' })).not.toThrow()
      expect(mockSpan.addTags).not.toHaveBeenCalled()
    })

    it('should set user ID on active span', () => {
      manager.setUserID('user-456')

      expect(mockSpan.setTag).toHaveBeenCalledWith('usr.id', 'user-456')
    })

    it('should set controller name on active span', () => {
      manager.setControllerName('MyController', 'myAction')

      expect(mockSpan.setTag).toHaveBeenCalledWith('code.namespace', 'MyController')
      expect(mockSpan.setTag).toHaveBeenCalledWith('code.function', 'myAction')
    })

    it('should remove span from map after stopping', () => {
      manager.start('my-transaction', 'unique-key')
      manager.stop('unique-key')

      // Stopping again should be a no-op (span already removed)
      mockSpan.finish.mockClear()
      manager.stop('unique-key')
      expect(mockSpan.finish).not.toHaveBeenCalled()
    })
  })

  describe('active span is null', () => {
    let manager: DatadogTransactionManager

    beforeEach(() => {
      vi.clearAllMocks()
      mockTracer.scope.mockReturnValue({
        active: vi.fn().mockReturnValue(null),
      })
      manager = new DatadogTransactionManager(true)
    })

    afterEach(() => {
      mockTracer.scope.mockReturnValue({
        active: vi.fn().mockReturnValue(mockSpan),
      })
    })

    it('should not throw when no active span for addCustomAttribute', () => {
      expect(() => manager.addCustomAttribute('attr', 'value')).not.toThrow()
    })

    it('should not throw when no active span for setUserID', () => {
      expect(() => manager.setUserID('user-123')).not.toThrow()
    })

    it('should not throw when no active span for setControllerName', () => {
      expect(() => manager.setControllerName('Controller', 'action')).not.toThrow()
    })
  })
})
