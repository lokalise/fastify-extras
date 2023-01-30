import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import { publicHealthcheckPlugin } from './publicHealthcheckPlugin'

async function initApp() {
  const app = fastify()
  await app.register(publicHealthcheckPlugin)
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
})
