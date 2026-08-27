import {
  type ApiDocumentationTransform,
  DEFAULT_INTERNAL_MARKER_KEY,
  apiDocumentationTransform,
} from './apiDocumentationTransform.js'
import type { OpenApiRouteSchema } from './documentationRouteMatchers.js'

/**
 * `SwaggerTransform` declares a full `RouteOptions` and an always-present
 * schema; `@fastify/swagger` calls it with the route it happens to hold, and
 * with no schema at all for a route registered without one. The transform only
 * reads `url`, `route.method` and `schema`, so the fixture supplies those.
 */
const input = (
  url: string,
  schema?: OpenApiRouteSchema,
  method: string | string[] = 'GET',
): Parameters<ApiDocumentationTransform>[0] =>
  ({
    url,
    schema,
    route: { url, method, schema },
    openapiObject: {},
  }) as unknown as Parameters<ApiDocumentationTransform>[0]

describe('apiDocumentationTransform', () => {
  describe('audience derivation', () => {
    it('keeps a hidden route hidden in the public document', () => {
      const transform = apiDocumentationTransform({ audience: 'public' })

      expect(transform(input('/internal-task', { hide: true })).schema?.hide).toBe(true)
    })

    it('un-hides a hidden route in the internal document', () => {
      const transform = apiDocumentationTransform({ audience: 'internal' })

      expect(transform(input('/internal-task', { hide: true })).schema?.hide).toBe(false)
    })

    it('publishes an unhidden route in both documents', () => {
      const publicTransform = apiDocumentationTransform({ audience: 'public' })
      const internalTransform = apiDocumentationTransform({ audience: 'internal' })

      expect(publicTransform(input('/users', { hide: false })).schema?.hide).toBe(false)
      expect(internalTransform(input('/users', { hide: false })).schema?.hide).toBe(false)
    })

    it('treats a route without a hide flag as public', () => {
      const transform = apiDocumentationTransform({ audience: 'public' })

      expect(transform(input('/users', { tags: ['users'] })).schema?.hide).toBe(false)
    })

    it('leaves a schema-less route documented, with nothing added to it', () => {
      const transform = apiDocumentationTransform({ audience: 'public' })

      expect(transform(input('/users')).schema).toStrictEqual({})
    })

    it('invents a schema for a schema-less route that has to be hidden', () => {
      const transform = apiDocumentationTransform({
        audience: 'public',
        hiddenRoutes: ['/metrics'],
      })

      expect(transform(input('/metrics')).schema).toStrictEqual({ hide: true })
    })
  })

  describe('overrides', () => {
    it('hides a matched route in both documents', () => {
      const options = { hiddenRoutes: ['/metrics'] } as const

      expect(
        apiDocumentationTransform({ audience: 'public', ...options })(input('/metrics', {})).schema
          ?.hide,
      ).toBe(true)
      expect(
        apiDocumentationTransform({ audience: 'internal', ...options })(input('/metrics', {}))
          .schema?.hide,
      ).toBe(true)
    })

    it('hides a listed route from the internal document too', () => {
      const transform = apiDocumentationTransform({
        audience: 'internal',
        hiddenRoutes: ['/metrics'],
      })

      expect(transform(input('/metrics', { hide: false })).schema?.hide).toBe(true)
    })

    /**
     * The only override subtracts. A route the builder did not hide cannot be
     * moved into the internal document from here, and a route it did hide
     * cannot be moved out of it.
     */
    it('leaves the choice between the two documents to the hide flag', () => {
      const options = { hiddenRoutes: ['/admin'] } as const

      expect(
        apiDocumentationTransform({ audience: 'public', ...options })(
          input('/users', { hide: false }),
        ).schema?.hide,
      ).toBe(false)
      expect(
        apiDocumentationTransform({ audience: 'public', ...options })(
          input('/task', { hide: true }),
        ).schema?.hide,
      ).toBe(true)
      expect(
        apiDocumentationTransform({ audience: 'internal', ...options })(
          input('/task', { hide: true }),
        ).schema?.hide,
      ).toBe(false)
    })
  })

  describe('internal marker', () => {
    it('marks internal operations in the internal document', () => {
      const transform = apiDocumentationTransform({ audience: 'internal' })

      const { schema } = transform(input('/internal-task', { hide: true }))

      expect(schema).toHaveProperty(DEFAULT_INTERNAL_MARKER_KEY, true)
    })

    it('does not mark public operations', () => {
      const transform = apiDocumentationTransform({ audience: 'internal' })

      const { schema } = transform(input('/users', { hide: false }))

      expect(schema).not.toHaveProperty(DEFAULT_INTERNAL_MARKER_KEY)
    })

    it('does not mark anything in the public document', () => {
      const transform = apiDocumentationTransform({ audience: 'public' })

      const { schema } = transform(input('/internal-task', { hide: true }))

      expect(schema?.hide).toBe(true)
      expect(schema).not.toHaveProperty(DEFAULT_INTERNAL_MARKER_KEY)
    })

    it('does not mark a route hidden from both documents', () => {
      const transform = apiDocumentationTransform({
        audience: 'internal',
        hiddenRoutes: ['/metrics'],
      })

      const { schema } = transform(input('/metrics', { hide: true }))

      expect(schema).not.toHaveProperty(DEFAULT_INTERNAL_MARKER_KEY)
    })

    it('supports a custom marker key', () => {
      const transform = apiDocumentationTransform({
        audience: 'internal',
        internalMarkerKey: 'x-lokalise-internal',
      })

      const { schema } = transform(input('/internal-task', { hide: true }))

      expect(schema).toHaveProperty('x-lokalise-internal', true)
    })

    it('can be turned off', () => {
      const transform = apiDocumentationTransform({
        audience: 'internal',
        internalMarkerKey: false,
      })

      const { schema } = transform(input('/internal-task', { hide: true }))

      expect(schema).toStrictEqual({ hide: false })
    })

    it('rejects a marker key @fastify/swagger would drop', () => {
      expect(() =>
        apiDocumentationTransform({ audience: 'internal', internalMarkerKey: 'internal' }),
      ).toThrow(/must be an OpenAPI extension key/)
      expect(() =>
        apiDocumentationTransform({ audience: 'internal', internalMarkerKey: 'x-' }),
      ).toThrow(/must be an OpenAPI extension key/)
    })

    it('rejects the marker keys Scalar reads as a request to hide the operation', () => {
      expect(() =>
        apiDocumentationTransform({ audience: 'internal', internalMarkerKey: 'x-internal' }),
      ).toThrow(/hide the operation/)
      expect(() =>
        apiDocumentationTransform({ audience: 'internal', internalMarkerKey: 'x-scalar-ignore' }),
      ).toThrow(/hide the operation/)
    })
  })

  describe('chaining', () => {
    it('runs the chained transform on the audience-adjusted schema', () => {
      const seen: Array<boolean | undefined> = []
      const transform = apiDocumentationTransform({
        audience: 'internal',
        transform: ({ schema, url }) => {
          seen.push(schema?.hide)
          return { schema, url }
        },
      })

      transform(input('/internal-task', { hide: true }))

      expect(seen).toStrictEqual([false])
    })

    it('marks the schema the chained transform returned', () => {
      const transform = apiDocumentationTransform({
        audience: 'internal',
        transform: ({ url }) => ({ schema: { description: 'rebuilt' }, url }),
      })

      const { schema } = transform(input('/internal-task', { hide: true }))

      expect(schema).toStrictEqual({
        description: 'rebuilt',
        [DEFAULT_INTERNAL_MARKER_KEY]: true,
      })
    })

    it('keeps the url the chained transform returned', () => {
      const transform = apiDocumentationTransform({
        audience: 'public',
        transform: () => ({ schema: {}, url: '/rewritten' }),
      })

      expect(transform(input('/users', {})).url).toBe('/rewritten')
    })
  })

  it('does not mutate the route schema, which every document shares', () => {
    const schema: OpenApiRouteSchema = { hide: true, tags: ['tasks'] }
    const transformInput = input('/internal-task', schema)

    apiDocumentationTransform({ audience: 'internal' })(transformInput)
    apiDocumentationTransform({ audience: 'public' })(transformInput)

    expect(schema).toStrictEqual({ hide: true, tags: ['tasks'] })
  })
})
