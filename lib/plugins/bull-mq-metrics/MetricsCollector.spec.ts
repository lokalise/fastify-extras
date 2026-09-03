import * as prometheus from '@prometheus-io/client'
import type { FastifyBaseLogger } from 'fastify'
import { describe, expect, it } from 'vitest'
import type { MetricCollectorOptions } from './MetricsCollector.js'
import { MetricsCollector } from './MetricsCollector.js'

const options = {
  bullMqPrefix: 'bull',
  metricsPrefix: 'metrics_collector_spec',
  queueDiscoverer: { discoverQueues: () => Promise.resolve([]) },
  excludedQueues: [],
  histogramBuckets: [20, 50],
} satisfies MetricCollectorOptions

const logger = { warn: () => {} } as unknown as FastifyBaseLogger

describe('MetricsCollector', () => {
  it('reuses metrics that another collector already registered', async () => {
    const registry = new prometheus.Registry()

    const first = new MetricsCollector(options, registry, logger)
    const second = new MetricsCollector(options, registry, logger)

    await first.collect()
    await second.collect()

    // Both collectors observe the same metric objects, and the registry holds one of each
    const registeredNames = registry.getMetricsAsArray().map((metric) => metric.name)
    expect(registeredNames).toStrictEqual([
      'metrics_collector_spec_jobs_count',
      'metrics_collector_spec_jobs_processed_duration',
      'metrics_collector_spec_jobs_finished_duration',
    ])
  })
})
