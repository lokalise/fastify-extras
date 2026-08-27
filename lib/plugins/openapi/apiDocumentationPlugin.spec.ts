import fastify, { type FastifyInstance } from 'fastify'
import {
  type ZodTypeProvider,
  createJsonSchemaTransform,
  createJsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  type ApiDocumentationPluginOptions,
  apiDocumentationPlugin,
} from './apiDocumentationPlugin.js'
import { DEFAULT_INTERNAL_MARKER_KEY } from './apiDocumentationTransform.js'
import { DEFAULT_HIDDEN_ROUTES } from './documentationRouteMatchers.js'

/**
 * A registry of its own rather than `z.globalRegistry`, so the model
 * assertions below see exactly the schemas this file registers.
 */
const schemaRegistry = z.registry<{ id?: string }>()

const CATEGORY_SCHEMA = z.object({ name: z.string() })
const USER_SCHEMA = z.object({
  id: z.string(),
  email: z.string(),
  category: CATEGORY_SCHEMA,
})
const AUDIT_SCHEMA = z.object({ actor: z.string(), action: z.string() })
const REPORT_SCHEMA = z.object({ reindexedDocuments: z.number() })
const ORPHAN_SCHEMA = z.object({ nothingReferencesThis: z.boolean() })
const TREE_NODE_SCHEMA: z.ZodType = z.object({
  label: z.string(),
  get children() {
    return z.array(TREE_NODE_SCHEMA)
  },
})

schemaRegistry.add(CATEGORY_SCHEMA, { id: 'Category' })
schemaRegistry.add(USER_SCHEMA, { id: 'User' })
schemaRegistry.add(AUDIT_SCHEMA, { id: 'Audit' })
schemaRegistry.add(REPORT_SCHEMA, { id: 'Report' })
schemaRegistry.add(ORPHAN_SCHEMA, { id: 'Orphan' })
schemaRegistry.add(TREE_NODE_SCHEMA, { id: 'TreeNode' })

/**
 * The generated document, in the shape these assertions read it. Looser than
 * `openapi-types`, which describes path items precisely enough that indexing
 * them by operation name would need a narrowing step in every assertion.
 */
type OpenApiDocument = {
  info?: { title?: string }
  paths: Record<string, Record<string, Record<string, unknown> | undefined> | undefined>
  components?: { schemas?: Record<string, unknown> }
}

type DocumentedApp = FastifyInstance & { internalSwagger?: () => unknown }

const publicDocument = (app: DocumentedApp): OpenApiDocument =>
  app.swagger() as unknown as OpenApiDocument

const internalDocument = (app: DocumentedApp): OpenApiDocument | undefined =>
  app.internalSwagger?.() as OpenApiDocument | undefined

const documentedPaths = (document: OpenApiDocument | undefined): string[] =>
  Object.keys(document?.paths ?? {}).sort()

const documentedOperations = (document: OpenApiDocument | undefined, path: string): string[] =>
  Object.keys(document?.paths?.[path] ?? {}).sort()

const modelNames = (document: OpenApiDocument | undefined): string[] =>
  Object.keys(document?.components?.schemas ?? {}).sort()

const buildApp = async (
  options: Partial<ApiDocumentationPluginOptions> = {},
): Promise<DocumentedApp> => {
  const app = fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(apiDocumentationPlugin, {
    openapi: { info: { title: 'Users API', version: '1.0.0' } },
    // Opt in here rather than in every block: the option is off by default,
    // and most of what there is to assert lives in the internal document.
    exposeInternalDocumentation: true,
    transform: createJsonSchemaTransform({ schemaRegistry }),
    transformObject: createJsonSchemaTransformObject({ schemaRegistry }),
    logLevel: 'silent',
    ...options,
  })

  const typedApp = app.withTypeProvider<ZodTypeProvider>()

  // Service utility endpoints: no contract, hidden from both documents by
  // the defaults rather than by a flag of their own.
  typedApp.get('/', () => ({ status: 'ok' }))
  typedApp.get('/health', () => ({ status: 'ok' }))
  typedApp.get('/metrics', () => 'metrics')

  // Public contracts.
  typedApp.get(
    '/users/:userId',
    { schema: { params: z.object({ userId: z.string() }), response: { 200: USER_SCHEMA } } },
    () => ({ id: '1', email: 'a@b.c', category: { name: 'admin' } }),
  )
  typedApp.post(
    '/users',
    { schema: { body: USER_SCHEMA, response: { 200: USER_SCHEMA } } },
    () => ({ id: '1', email: 'a@b.c', category: { name: 'admin' } }),
  )
  typedApp.get('/audit', { schema: { response: { 200: AUDIT_SCHEMA } } }, () => ({
    actor: 'a',
    action: 'b',
  }))
  typedApp.get('/tree', { schema: { response: { 200: TREE_NODE_SCHEMA } } }, () => ({
    label: 'root',
    children: [],
  }))

  // Internal contracts: hidden by the route builder.
  typedApp.post(
    '/internal/reindex',
    { schema: { hide: true, body: REPORT_SCHEMA, response: { 200: REPORT_SCHEMA } } },
    () => ({ reindexedDocuments: 1 }),
  )
  typedApp.get(
    '/internal/audit',
    { schema: { hide: true, response: { 200: AUDIT_SCHEMA } } },
    () => ({ actor: 'a', action: 'b' }),
  )

  // Overridden either way by the tests that care.
  typedApp.get('/legacy', { schema: { hide: true } }, () => ({ status: 'ok' }))
  typedApp.delete(
    '/users/:userId',
    { schema: { params: z.object({ userId: z.string() }) } },
    () => ({ status: 'ok' }),
  )

  await app.ready()

  return app as DocumentedApp
}

const collectRefs = (value: unknown, acc: Set<string>): void => {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, acc)
    return
  }
  if (typeof value !== 'object' || value === null) return

  for (const [key, nested] of Object.entries(value)) {
    if (key === '$ref' && typeof nested === 'string') acc.add(nested)
    else collectRefs(nested, acc)
  }
}

const resolveRef = (document: OpenApiDocument, ref: string): unknown =>
  ref
    .slice('#/'.length)
    .split('/')
    .reduce<unknown>(
      (node, segment) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      document,
    )

const expectNoDanglingRefs = (document: OpenApiDocument | undefined): void => {
  expect(document).toBeDefined()
  const refs = new Set<string>()
  collectRefs(document, refs)

  for (const ref of refs) {
    expect(resolveRef(document as OpenApiDocument, ref), `dangling reference ${ref}`).toBeDefined()
  }
}

describe('apiDocumentationPlugin', () => {
  describe('audience separation', () => {
    let app: DocumentedApp

    beforeAll(async () => {
      app = await buildApp({
        publicRoutes: ['/legacy'],
        internalRoutes: [(route) => route.method === 'DELETE'],
      })
    })

    afterAll(async () => {
      await app.close()
    })

    it('publishes only the endpoints that are not hidden', () => {
      expect(documentedPaths(publicDocument(app))).toStrictEqual([
        '/audit',
        '/legacy',
        '/tree',
        '/users',
        '/users/{userId}',
      ])
    })

    it('publishes the hidden endpoints in the internal document, alongside the public ones', () => {
      expect(documentedPaths(internalDocument(app))).toStrictEqual([
        '/audit',
        '/internal/audit',
        '/internal/reindex',
        '/legacy',
        '/tree',
        '/users',
        '/users/{userId}',
      ])
    })

    it('keeps the service utility endpoints out of both documents', () => {
      const allPaths = [
        ...documentedPaths(publicDocument(app)),
        ...documentedPaths(internalDocument(app)),
      ]

      expect(allPaths).not.toContain('/')
      expect(allPaths).not.toContain('/health')
      expect(allPaths).not.toContain('/metrics')
    })

    it('keeps the documentation routes out of both documents', () => {
      const allPaths = [
        ...documentedPaths(publicDocument(app)),
        ...documentedPaths(internalDocument(app)),
      ]

      expect(allPaths.filter((path) => path.startsWith('/documentation'))).toStrictEqual([])
    })

    it('honours an override that publishes a hidden endpoint', () => {
      expect(documentedOperations(publicDocument(app), '/legacy')).toStrictEqual(['get'])
    })

    it('honours an override that hides a published endpoint from the public document only', () => {
      expect(documentedOperations(publicDocument(app), '/users/{userId}')).toStrictEqual(['get'])
      expect(documentedOperations(internalDocument(app), '/users/{userId}')).toStrictEqual([
        'delete',
        'get',
      ])
    })

    it('marks internal operations in the internal document', () => {
      const document = internalDocument(app)

      expect(document?.paths['/internal/reindex']?.post).toHaveProperty(
        DEFAULT_INTERNAL_MARKER_KEY,
        true,
      )
      expect(document?.paths['/users']?.post).not.toHaveProperty(DEFAULT_INTERNAL_MARKER_KEY)
    })

    it('does not mark an endpoint the override moved into the public document', () => {
      expect(internalDocument(app)?.paths['/legacy']?.get).not.toHaveProperty(
        DEFAULT_INTERNAL_MARKER_KEY,
      )
    })

    it('titles the internal document apart from the public one', () => {
      expect(publicDocument(app).info?.title).toBe('Users API')
      expect(internalDocument(app)?.info?.title).toBe('Users API (internal)')
    })

    it('generating one document does not corrupt the other', () => {
      const internalPaths = documentedPaths(internalDocument(app))
      const publicPaths = documentedPaths(publicDocument(app))

      expect(documentedPaths(internalDocument(app))).toStrictEqual(internalPaths)
      expect(documentedPaths(publicDocument(app))).toStrictEqual(publicPaths)
    })
  })

  describe('model handling', () => {
    let app: DocumentedApp

    beforeAll(async () => {
      app = await buildApp()
    })

    afterAll(async () => {
      await app.close()
    })

    it('publishes only the models the public operations reach', () => {
      expect(modelNames(publicDocument(app))).toStrictEqual([
        'Audit',
        'Category',
        'CategoryInput',
        'TreeNode',
        'User',
        'UserInput',
      ])
    })

    it('does not leak the fields of an internal model into the public document', () => {
      expect(JSON.stringify(publicDocument(app))).not.toContain('reindexedDocuments')
    })

    it('keeps a model shared by a public and an internal operation', () => {
      expect(modelNames(publicDocument(app))).toContain('Audit')
      expect(modelNames(internalDocument(app))).toContain('Audit')
    })

    it('publishes the internal-only model in the internal document', () => {
      expect(modelNames(internalDocument(app))).toContain('Report')
    })

    it('drops a registered model no operation references', () => {
      expect(modelNames(publicDocument(app))).not.toContain('Orphan')
      expect(modelNames(internalDocument(app))).not.toContain('Orphan')
    })

    it('keeps only the direction of an input/output pair that is used', () => {
      const models = modelNames(publicDocument(app))

      // `User` is both a request body and a response, `Audit` a response only.
      expect(models).toContain('UserInput')
      expect(models).toContain('User')
      expect(models).not.toContain('AuditInput')
    })

    it('keeps a self-referential model, and its own reference', () => {
      const document = publicDocument(app)

      expect(modelNames(document)).toContain('TreeNode')
      expect(JSON.stringify(document.components?.schemas?.TreeNode)).toContain(
        '#/components/schemas/TreeNode',
      )
    })

    it('leaves no dangling references behind in either document', () => {
      expectNoDanglingRefs(publicDocument(app))
      expectNoDanglingRefs(internalDocument(app))
    })
  })

  describe('pruneUnreferencedComponents: false', () => {
    let app: DocumentedApp

    beforeAll(async () => {
      app = await buildApp({ pruneUnreferencedComponents: false })
    })

    afterAll(async () => {
      await app.close()
    })

    it('publishes the whole registry in the public document, internal models included', () => {
      const models = modelNames(publicDocument(app))

      expect(models).toContain('Report')
      expect(models).toContain('Orphan')
      expect(JSON.stringify(publicDocument(app))).toContain('reindexedDocuments')
    })
  })

  describe('serving the references', () => {
    let app: DocumentedApp

    beforeAll(async () => {
      app = await buildApp()
    })

    afterAll(async () => {
      await app.close()
    })

    it('serves the public reference', async () => {
      const response = await app.inject().get('/documentation/').end()

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('text/html')
    })

    it('serves the internal reference', async () => {
      const response = await app.inject().get('/documentation/internal/').end()

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('text/html')
    })

    it('serves the public document as JSON', async () => {
      const response = await app.inject().get('/documentation/openapi.json').end()

      expect(response.statusCode).toBe(200)
      expect(documentedPaths(response.json<OpenApiDocument>())).not.toContain('/internal/reindex')
    })

    it('serves the internal document as JSON', async () => {
      const response = await app.inject().get('/documentation/internal/openapi.json').end()

      expect(response.statusCode).toBe(200)
      expect(documentedPaths(response.json<OpenApiDocument>())).toContain('/internal/reindex')
    })
  })

  describe('exposeInternalDocumentation: false', () => {
    let app: DocumentedApp

    beforeAll(async () => {
      app = await buildApp({ exposeInternalDocumentation: false })
    })

    afterAll(async () => {
      await app.close()
    })

    it('does not build an internal document at all', () => {
      expect(app.internalSwagger).toBeUndefined()
    })

    it('does not serve the internal reference', async () => {
      expect((await app.inject().get('/documentation/internal/').end()).statusCode).toBe(404)
      expect(
        (await app.inject().get('/documentation/internal/openapi.json').end()).statusCode,
      ).toBe(404)
    })

    it('still serves the public reference, with the public document', async () => {
      const response = await app.inject().get('/documentation/openapi.json').end()

      expect(response.statusCode).toBe(200)
      expect(documentedPaths(response.json<OpenApiDocument>())).not.toContain('/internal/reindex')
    })
  })

  describe('exposeInternalDocumentation default', () => {
    let app: DocumentedApp

    beforeAll(async () => {
      // Registered without the option, unlike `buildApp`, which opts in.
      app = fastify()
      await app.register(apiDocumentationPlugin, {
        openapi: { info: { title: 'Users API', version: '1.0.0' } },
        logLevel: 'silent',
      })
      app.get('/internal/reindex', { schema: { hide: true } }, () => ({ status: 'ok' }))
      await app.ready()
    })

    afterAll(async () => {
      await app.close()
    })

    it('leaves the internal reference off until the service asks for it', async () => {
      expect(app.internalSwagger).toBeUndefined()
      expect(
        (await app.inject().get('/documentation/internal/openapi.json').end()).statusCode,
      ).toBe(404)
      expect((await app.inject().get('/documentation/openapi.json').end()).statusCode).toBe(200)
    })
  })

  describe('custom route prefixes', () => {
    let app: DocumentedApp

    beforeAll(async () => {
      app = await buildApp({
        publicRoutePrefix: '/reference',
        internalRoutePrefix: '/reference-internal',
        hiddenRoutes: DEFAULT_HIDDEN_ROUTES,
      })
    })

    afterAll(async () => {
      await app.close()
    })

    it('serves both references under the configured prefixes', async () => {
      expect((await app.inject().get('/reference/').end()).statusCode).toBe(200)
      expect((await app.inject().get('/reference-internal/').end()).statusCode).toBe(200)
    })

    it('keeps the reference routes out of both documents even when they are not the default', () => {
      const allPaths = [
        ...documentedPaths(publicDocument(app)),
        ...documentedPaths(internalDocument(app)),
      ]

      expect(allPaths.filter((path) => path.startsWith('/reference'))).toStrictEqual([])
    })
  })

  describe('hooks', () => {
    let app: DocumentedApp

    beforeAll(async () => {
      app = await buildApp({
        internalHooks: {
          onRequest: (_request, reply, done) => {
            reply.code(401).send({ message: 'internal documentation is not public' })
            done()
          },
        },
      })
    })

    afterAll(async () => {
      await app.close()
    })

    it('applies the internal hooks to the internal reference only', async () => {
      expect((await app.inject().get('/documentation/internal/').end()).statusCode).toBe(401)
      expect((await app.inject().get('/documentation/').end()).statusCode).toBe(200)
    })
  })
})
