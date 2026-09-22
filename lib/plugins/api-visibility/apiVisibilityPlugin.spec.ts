import fastify, { type FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { type ApiVisibilityPluginOptions, apiVisibilityPlugin } from './apiVisibilityPlugin.js'

const USER_SCHEMA = z.object({
  id: z.string(),
  mandatoryInternal: z.string().meta({ visibility: 'internal' }),
  optionalInternal: z.string().optional().meta({ visibility: 'internal' }),
  items: z.array(z.object({ keep: z.string(), hide: z.string().meta({ visibility: 'internal' }) })),
})

const buildApp = async (options: ApiVisibilityPluginOptions = {}): Promise<FastifyInstance> => {
  const app = fastify()

  await app.register(apiVisibilityPlugin, options)

  const typedApp = app.withTypeProvider<ZodTypeProvider>()

  typedApp.get(
    '/user',
    {
      schema: {
        querystring: z.object({ status: z.enum(['201', '204']).optional() }),
        response: {
          200: USER_SCHEMA,
          201: z.object({ id: z.string() }),
          204: z.undefined(),
        },
      },
    },
    (request, reply) => {
      const { status } = request.query
      if (status === '201') {
        const created = { id: '1', name: 'Ada' }
        reply.code(201).send(created)
        return
      }
      if (status === '204') {
        reply.code(204).send()
        return
      }
      reply.code(200).send({
        id: '1',
        mandatoryInternal: 'm',
        optionalInternal: 'o',
        items: [{ keep: 'k', hide: 'h' }],
      })
    },
  )

  typedApp.get('/plain', { schema: { response: { 200: z.object({ id: z.string() }) } } }, () => ({
    id: '1',
  }))

  await app.ready()

  return app
}

const getUser = (app: FastifyInstance, headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: '/user', headers }).then((response) => response.json())

describe('apiVisibilityPlugin', () => {
  let app: FastifyInstance

  afterEach(async () => {
    await app.close()
  })

  it('strips internal fields for a public caller', async () => {
    app = await buildApp()

    expect(await getUser(app, { 'x-api-source': 'public' })).toEqual({
      id: '1',
      items: [{ keep: 'k' }],
    })
  })

  it('keeps internal fields for an internal caller', async () => {
    app = await buildApp()

    expect(await getUser(app, { 'x-api-source': 'internal' })).toEqual({
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

    expect(await getUser(app, { 'x-api-source': 'anonymous' })).toEqual({
      id: '1',
      items: [{ keep: 'k' }],
    })
  })

  it('resolves the audience from a configured header name', async () => {
    app = await buildApp({ sourceHeader: 'x-caller' })

    // The default header no longer applies, so it is treated as public.
    expect(await getUser(app, { 'x-api-source': 'internal' })).toEqual({
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
    // Node lowercases incoming header names, so an uppercase `sourceHeader` must
    // still resolve — otherwise the internal caller below would be seen as public.
    app = await buildApp({ sourceHeader: 'X-API-SOURCE' })

    expect(await getUser(app, { 'x-api-source': 'internal' })).toEqual({
      id: '1',
      mandatoryInternal: 'm',
      optionalInternal: 'o',
      items: [{ keep: 'k', hide: 'h' }],
    })
  })

  it('leaves a route without internal fields untouched for a public caller', async () => {
    app = await buildApp()

    const body = await app
      .inject({ method: 'GET', url: '/plain', headers: { 'x-api-source': 'public' } })
      .then((response) => response.json())
    expect(body).toEqual({ id: '1' })
  })

  it('selects the encoder by status code and schema-encodes a non-stripping status', async () => {
    app = await buildApp()

    const created = await app
      .inject({ method: 'GET', url: '/user?status=201', headers: { 'x-api-source': 'public' } })
      .then((response) => response.json())
    expect(created).toEqual({ id: '1' })
  })

  it('handles an empty-object status', async () => {
    app = await buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/user?status=204',
      headers: { 'x-api-source': 'public' },
    })
    expect(response.statusCode).toBe(204)
    // Fastify sends no body for a 204, so there is nothing for the plugin's
    // serializer to strip — it must not break the empty-body response.
    expect(response.body).toBe('')
  })

  it('validates the request through the validator compiler it registers', async () => {
    app = await buildApp()

    // `status` must match the querystring enum; an out-of-range value proves the
    // plugin-registered Zod validator compiler is active on the request side.
    const response = await app.inject({
      method: 'GET',
      url: '/user?status=bogus',
      headers: { 'x-api-source': 'public' },
    })
    expect(response.statusCode).toBe(400)
  })
})
