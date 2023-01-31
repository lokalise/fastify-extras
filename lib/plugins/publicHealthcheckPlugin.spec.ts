import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import type { PublicHealthcheckPluginOptions } from './publicHealthcheckPlugin'
import { publicHealthcheckPlugin } from './publicHealthcheckPlugin'

async function initApp(opts?: PublicHealthcheckPluginOptions) {
  const app = fastify()
  await app.register(publicHealthcheckPlugin, opts)
  await app.ready()
  return app
}

describe('publicHealthcheckPlugin', () => {
  let app: FastifyInstance
  afterAll(async () => {
    await app.close()
  })

  it('returns a heartbeat', async () => {
    app = await initApp()

    const response = await app.inject().get('/').end()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'OK' })
  })

  it('returns custom heartbeat', async () => {
    app = await initApp({ responsePayload: { version: 1 } })

    const response = await app.inject().get('/').end()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ version: 1 })
  })
})
