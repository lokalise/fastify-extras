import fastify, { type FastifyInstance } from 'fastify'
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
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
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(apiVisibilityPlugin, options)

  const typedApp = app.withTypeProvider<ZodTypeProvider>()

  typedApp.get('/user', { schema: { response: { 200: USER_SCHEMA } } }, () => ({
    id: '1',
    mandatoryInternal: 'm',
    optionalInternal: 'o',
    items: [{ keep: 'k', hide: 'h' }],
  }))

  // No internal fields: the plugin builds no encoder for this route (zero cost).
  typedApp.get('/plain', { schema: { response: { 200: z.object({ id: z.string() }) } } }, () => ({
    id: '1',
  }))

  // Multi-status: each status has its own internal field, exercising the
  // statusCode-based encoder selection at send time.
  typedApp.get(
    '/multi',
    {
      schema: {
        response: {
          200: z.object({ id: z.string(), secret: z.string().meta({ visibility: 'internal' }) }),
          201: z.object({ token: z.string(), issuer: z.string().meta({ visibility: 'internal' }) }),
        },
      },
    },
    (request, reply) => {
      if ((request.query as { created?: string }).created === '1') {
        reply.code(201)
        return { token: 't', issuer: 'i' }
      }
      return { id: '1', secret: 's' }
    },
  )

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

  it('picks the encoder by status code on a multi-status route', async () => {
    app = await buildApp()

    const ok = await app
      .inject({ method: 'GET', url: '/multi', headers: { 'x-api-source': 'public' } })
      .then((response) => response.json())
    expect(ok).toEqual({ id: '1' })

    const created = await app
      .inject({ method: 'GET', url: '/multi?created=1', headers: { 'x-api-source': 'public' } })
      .then((response) => response.json())
    expect(created).toEqual({ token: 't' })
  })
})
