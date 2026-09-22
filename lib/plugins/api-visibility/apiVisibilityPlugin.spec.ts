import { defineApiContract } from '@lokalise/api-contracts'
import { buildFastifyApiRoute } from '@lokalise/fastify-api-contracts'
import fastify, { type FastifyInstance } from 'fastify'
import { z } from 'zod/v4'
import { type ApiVisibilityPluginOptions, apiVisibilityPlugin } from './apiVisibilityPlugin.js'

const USER_SCHEMA = z.object({
  id: z.string(),
  mandatoryInternal: z.string().meta({ visibility: 'internal' }),
  optionalInternal: z.string().optional().meta({ visibility: 'internal' }),
  items: z.array(z.object({ keep: z.string(), hide: z.string().meta({ visibility: 'internal' }) })),
})

const USER_CONTRACT = defineApiContract({
  visibility: 'public',
  method: 'get',
  description: 'user',
  summary: 'user',
  pathResolver: () => '/user',
  requestQuerySchema: z.object({ status: z.enum(['201', '204']).optional() }),
  responsesByStatusCode: {
    200: USER_SCHEMA,
    201: z.object({ id: z.string() }),
    204: z.undefined(),
  },
})

const HEALTH_CONTRACT = defineApiContract({
  visibility: 'public',
  method: 'get',
  description: 'health',
  summary: 'health',
  pathResolver: () => '/health',
  responsesByStatusCode: { 200: z.object({ status: z.string() }) },
})

const buildApp = async (options: ApiVisibilityPluginOptions = {}): Promise<FastifyInstance> => {
  const app = fastify()
  await app.register(apiVisibilityPlugin, options)

  app.route(
    buildFastifyApiRoute(USER_CONTRACT, (request) => {
      const { status } = request.query
      if (status === '201') {
        // `name` is absent from the 201 schema; only `id` may survive.
        const created = { id: '1', name: 'Ada' }
        return { status: 201, body: created }
      }
      if (status === '204') return { status: 204, body: undefined }
      return {
        status: 200,
        body: {
          id: '1',
          mandatoryInternal: 'm',
          optionalInternal: 'o',
          items: [{ keep: 'k', hide: 'h' }],
        },
      }
    }),
  )
  app.route(buildFastifyApiRoute(HEALTH_CONTRACT, () => ({ status: 200, body: { status: 'ok' } })))

  app.get(
    '/legacy',
    {
      config: { visibility: 'internal', apiContract: undefined as any },
      schema: { response: { 200: z.object({ id: z.string() }) } },
    },
    () => ({ id: '1' }),
  )

  // No visibility marker anywhere: resolveVisibility fails closed to internal.
  app.get('/unmarked', { schema: { response: { 200: z.object({ id: z.string() }) } } }, () => ({
    id: '1',
  }))

  await app.ready()
  return app
}

const getUser = (app: FastifyInstance, headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: '/user', headers }).then((response) => response.json())

const getStatus = (app: FastifyInstance, url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url, headers }).then((response) => response.statusCode)

describe('apiVisibilityPlugin', () => {
  let app: FastifyInstance

  afterEach(async () => {
    await app.close()
  })

  it('strips internal fields for a public caller', async () => {
    app = await buildApp()

    expect(await getUser(app, { 'x-api-audience': 'public' })).toEqual({
      id: '1',
      items: [{ keep: 'k' }],
    })
  })

  it('keeps internal fields for an internal caller', async () => {
    app = await buildApp()

    expect(await getUser(app, { 'x-api-audience': 'internal' })).toEqual({
      id: '1',
      mandatoryInternal: 'm',
      optionalInternal: 'o',
      items: [{ keep: 'k', hide: 'h' }],
    })
  })

  it('treats a missing source header as public (fail-closed)', async () => {
    app = await buildApp()

    expect(await getUser(app)).toEqual({ id: '1', items: [{ keep: 'k' }] })
  })

  it('treats an unknown source value as public (fail-closed)', async () => {
    app = await buildApp()

    expect(await getUser(app, { 'x-api-audience': 'anonymous' })).toEqual({
      id: '1',
      items: [{ keep: 'k' }],
    })
  })

  it('resolves the audience from a configured header name', async () => {
    app = await buildApp({ sourceHeader: 'x-caller' })

    // The default header no longer applies, so it is treated as public.
    expect(await getUser(app, { 'x-api-audience': 'internal' })).toEqual({
      id: '1',
      items: [{ keep: 'k' }],
    })
    expect(await getUser(app, { 'x-caller': 'internal' })).toEqual({
      id: '1',
      mandatoryInternal: 'm',
      optionalInternal: 'o',
      items: [{ keep: 'k', hide: 'h' }],
    })
  })

  it('matches the configured header name case-insensitively', async () => {
    // Node lowercases incoming header names
    app = await buildApp({ sourceHeader: 'X-API-AUDIENCE' })

    expect(await getUser(app, { 'x-api-audience': 'internal' })).toEqual({
      id: '1',
      mandatoryInternal: 'm',
      optionalInternal: 'o',
      items: [{ keep: 'k', hide: 'h' }],
    })
  })

  it('leaves a route without internal fields untouched for a public caller', async () => {
    app = await buildApp()

    const body = await app
      .inject({ method: 'GET', url: '/health', headers: { 'x-api-audience': 'public' } })
      .then((response) => response.json())
    expect(body).toEqual({ status: 'ok' })
  })

  it('selects the encoder by status code and schema-encodes a non-stripping status', async () => {
    app = await buildApp()

    const created = await app
      .inject({ method: 'GET', url: '/user?status=201', headers: { 'x-api-audience': 'public' } })
      .then((response) => response.json())
    expect(created).toEqual({ id: '1' })
  })

  it('handles an empty status', async () => {
    app = await buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/user?status=204',
      headers: { 'x-api-audience': 'public' },
    })
    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
  })

  it('validates the request through the validator compiler it registers', async () => {
    app = await buildApp()

    expect(await getStatus(app, '/user?status=bogus', { 'x-api-audience': 'public' })).toBe(400)
  })

  it('fails closed: gates a route whose visibility cannot be resolved', async () => {
    app = await buildApp()

    expect(await getStatus(app, '/unmarked', { 'x-api-audience': 'public' })).toBe(404)
    expect(await getStatus(app, '/unmarked', { 'x-api-audience': 'internal' })).toBe(200)
  })

  it('throws when registered after a route it should protect', async () => {
    app = fastify()
    app.get('/early', () => ({ id: '1' }))
    app.register(apiVisibilityPlugin)

    await expect(app.ready()).rejects.toThrow(/must be registered before/)
  })

  describe('legacy routes', () => {
    it('gates a public caller with a 404', async () => {
      app = await buildApp()

      expect(await getStatus(app, '/legacy', { 'x-api-audience': 'public' })).toBe(404)
    })

    it('lets an internal caller through', async () => {
      app = await buildApp()

      expect(await getStatus(app, '/legacy', { 'x-api-audience': 'internal' })).toBe(200)
    })
  })
})
