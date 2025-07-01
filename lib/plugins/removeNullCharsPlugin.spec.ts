import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'
import { removeNullCharsPlugin } from './removeNullCharsPlugin.js'

const initApp = async () => {
  const app = fastify()

  await app.register(removeNullCharsPlugin)

  app.post('/echo', (request) => {
    return request.body
  })

  await app.ready()

  return app
}

describe('removeNullCharsPlugin', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await initApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('removes null characters from strings and ignores non-string fields', async () => {
    const response = await app
      .inject()
      .post('/echo')
      .payload({
        name: 'jo\u0000hn',
        note: 'al\u0000right',
        valid: 'fine',
        count: 42,
        enabled: true,
      })
      .end()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      name: 'john',
      note: 'alright',
      valid: 'fine',
      count: 42,
      enabled: true,
    })
  })

  it('removes null characters from nested object values', async () => {
    const response = await app
      .inject()
      .post('/echo')
      .payload({
        user: { bio: 'hel\u0000lo' },
      })
      .end()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ user: { bio: 'hello' } })
  })

  it('removes null characters from array of strings', async () => {
    const response = await app
      .inject()
      .post('/echo')
      .payload({
        tags: ['wo\u0000w', 'no\u0000de'],
      })
      .end()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ tags: ['wow', 'node'] })
  })

  it('leaves clean values untouched', async () => {
    const payload = { message: 'clean', list: ['ok'] }

    const response = await app.inject().post('/echo').payload(payload).end()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(payload)
  })
})
