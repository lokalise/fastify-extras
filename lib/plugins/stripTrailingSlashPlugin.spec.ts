import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'

import { stripTrailingSlashPlugin } from './stripTrailingSlashPlugin.js'

const initApp = async () => {
  const app = fastify()

  await app.register(stripTrailingSlashPlugin)

  await app.ready()

  return app
}

describe('stripTrailingSlashPlugin', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await initApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('does not redirect on root', async () => {
    const response = await app.inject().get('/').end()

    expect(response.statusCode).not.toBe(302)
  })

  it('redirect when url ends with slash', async () => {
    const response = await app.inject().get('/some/').end()

    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe('/some')
  })

  it('redirect when path ends with slash and url has query params', async () => {
    const response = await app.inject().get('/some/?a=b').end()

    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe('/some?a=b')
  })
})
