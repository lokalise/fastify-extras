import type { AddressInfo } from 'node:net'
import { waitAndRetry } from '@lokalise/universal-ts-utils/waitAndRetry'
import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  addFeatureFlag,
  type BugsnagConfig,
  bugsnagErrorReporter,
  bugsnagPlugin,
  reportErrorToBugsnag,
} from './bugsnagPlugin.ts'

type ReceivedEvent = {
  exceptions: { message: string }[]
  severity: string
  unhandled: boolean
  metaData: Record<string, Record<string, unknown>>
  featureFlags: { featureFlag: string; variant?: string }[]
}

type ReceivedPayload = {
  apiKey: string
  events: ReceivedEvent[]
}

const API_KEY = '00000000000000000000000000000000'

// Receives what the Bugsnag client delivers, so tests check what would actually reach Bugsnag
async function initBugsnagServer(payloads: ReceivedPayload[]) {
  const server = fastify()
  server.post('/notify', (req, res) => {
    payloads.push(req.body as ReceivedPayload)
    return res.status(202).send()
  })
  server.post('/sessions', (_req, res) => res.status(202).send())
  await server.listen({ port: 0, host: '127.0.0.1' })
  return server
}

function buildBugsnagConfig(server: FastifyInstance, apiKey = API_KEY): BugsnagConfig {
  const { port } = server.server.address() as AddressInfo
  return {
    apiKey,
    releaseStage: 'test',
    // Bugsnag is a process-wide singleton and tests run with isolate: false, so it must not hook
    // into process-level errors nor track sessions for the rest of the test run
    autoDetectErrors: false,
    autoTrackSessions: false,
    logger: null,
    endpoints: {
      notify: `http://127.0.0.1:${port}/notify`,
      sessions: `http://127.0.0.1:${port}/sessions`,
    },
  }
}

async function initApp(isEnabled: boolean, bugsnag: BugsnagConfig) {
  const app = fastify()
  await app.register(bugsnagPlugin, { isEnabled, bugsnag })
  await app.ready()
  return app
}

// Once Bugsnag is started it cannot be stopped, so the disabled case must run first
describe('bugsnagPlugin', () => {
  const payloads: ReceivedPayload[] = []
  let bugsnagServer: FastifyInstance
  let app: FastifyInstance

  beforeAll(async () => {
    bugsnagServer = await initBugsnagServer(payloads)
  })

  beforeEach(() => {
    payloads.splice(0, payloads.length)
  })

  afterEach(async () => {
    await app.close()
  })

  afterAll(async () => {
    await bugsnagServer.close()
  })

  it('does not start Bugsnag if isEnabled is false', async () => {
    // Given
    app = await initApp(false, buildBugsnagConfig(bugsnagServer))

    // When
    const result = reportErrorToBugsnag({ error: new Error('not reported') })

    // Then
    expect(result).toBe(false)
  })

  it('sends errors reported with reportErrorToBugsnag', async () => {
    // Given
    app = await initApp(true, buildBugsnagConfig(bugsnagServer))

    // When
    reportErrorToBugsnag({
      error: new Error('reported error'),
      severity: 'warning',
      unhandled: false,
      context: { reqId: 'req-1' },
    })

    // Then
    const payload = await waitAndRetry(() => payloads[0])
    expect(payload).toMatchObject({
      apiKey: API_KEY,
      events: [
        {
          exceptions: [{ message: 'reported error' }],
          severity: 'warning',
          unhandled: false,
          metaData: { Context: { reqId: 'req-1' } },
        },
      ],
    })
  })

  it('sends errors reported with bugsnagErrorReporter', async () => {
    // Given
    app = await initApp(true, buildBugsnagConfig(bugsnagServer))

    // When
    bugsnagErrorReporter.report({ error: new Error('reported via error reporter') })

    // Then
    const payload = await waitAndRetry(() => payloads[0])
    expect(payload).toMatchObject({
      events: [
        {
          exceptions: [{ message: 'reported via error reporter' }],
          severity: 'error',
          unhandled: true,
        },
      ],
    })
  })

  it('sends feature flags added with addFeatureFlag', async () => {
    // Given
    app = await initApp(true, buildBugsnagConfig(bugsnagServer))
    addFeatureFlag('bugsnag-plugin-spec-flag', 'on')

    // When
    reportErrorToBugsnag({ error: new Error('with feature flag') })

    // Then
    const payload = await waitAndRetry(() => payloads[0])
    expect(payload).toMatchObject({
      events: [
        {
          featureFlags: expect.arrayContaining([
            { featureFlag: 'bugsnag-plugin-spec-flag', variant: 'on' },
          ]),
        },
      ],
    })
  })

  it('keeps the first configuration if the plugin is registered again', async () => {
    // Given
    app = await initApp(true, buildBugsnagConfig(bugsnagServer))
    const secondApp = await initApp(
      true,
      buildBugsnagConfig(bugsnagServer, '11111111111111111111111111111111'),
    )

    // When
    reportErrorToBugsnag({ error: new Error('after second registration') })

    // Then
    const payload = await waitAndRetry(() => payloads[0])
    expect(payload).toMatchObject({ apiKey: API_KEY })

    await secondApp.close()
  })
})
