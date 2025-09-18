import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import { describe } from 'vitest'
import type { HealthChecker } from './healthcheckCommons.js'
import {
  type StartupHealthcheckPluginOptions,
  startupHealthcheckPlugin,
} from './startupHealthcheckPlugin.js'

const positiveHealthcheckChecker: HealthChecker = () => {
  return Promise.resolve({ result: true })
}
const negativeHealthcheckChecker: HealthChecker = () => {
  return Promise.resolve({ error: new Error('Something exploded') })
}

async function initApp(opts: StartupHealthcheckPluginOptions) {
  const app = fastify()
  await app.register(startupHealthcheckPlugin, opts)
  await app.ready()
  return app
}

describe('startupHealthcheckPlugin', () => {
  let app: FastifyInstance
  afterAll(async () => {
    await app?.close()
  })

  describe('public endpoint', () => {
    it('app starts when no healthchecks', async () => {
      app = await initApp({ healthChecks: [] })
    })

    it('throws an error if one mandatory healthcheck fails', async () => {
      await expect(
        initApp({
          healthChecks: [
            {
              name: 'check1',
              isMandatory: true,
              checker: negativeHealthcheckChecker,
            },
            {
              name: 'check2',
              isMandatory: true,
              checker: positiveHealthcheckChecker,
            },
          ],
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: Healthchecks failed: ["check1"]]`)
    })

    it('app starts if optional healthcheck fails', async () => {
      app = await initApp({
        healthChecks: [
          {
            name: 'check1',
            isMandatory: false,
            checker: negativeHealthcheckChecker,
          },
          {
            name: 'check2',
            isMandatory: true,
            checker: positiveHealthcheckChecker,
          },
        ],
      })
    })

    it('app starts if all healthchecks pass', async () => {
      app = await initApp({
        healthChecks: [
          {
            name: 'check1',
            isMandatory: true,
            checker: positiveHealthcheckChecker,
          },
          {
            name: 'check2',
            isMandatory: true,
            checker: positiveHealthcheckChecker,
          },
        ],
      })
    })
  })
})
