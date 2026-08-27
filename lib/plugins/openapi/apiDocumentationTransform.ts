import type { SwaggerTransform } from '@fastify/swagger'
import {
  type DocumentationRouteMatcher,
  type DocumentedRoute,
  type OpenApiRouteSchema,
  matchesAnyRoute,
} from './documentationRouteMatchers.js'

/** Which of the two generated documents a transform is producing. */
export type ApiDocumentationAudience = 'public' | 'internal'

/** What {@link apiDocumentationTransform} builds: a `@fastify/swagger` transform. */
export type ApiDocumentationTransform = SwaggerTransform

/**
 * The transform input, with `schema` optional because a route may not have
 * one. `SwaggerTransform` declares it as always present, which is not what
 * `@fastify/swagger` passes for a route registered without a schema.
 */
export type ApiDocumentationTransformInput = {
  schema?: OpenApiRouteSchema
  url: string
  // biome-ignore lint/suspicious/noExplicitAny: route generics are erased at the document boundary
  route: any
  openapiObject?: unknown
  swaggerObject?: unknown
}

export type ApiDocumentationTransformResult = { schema: OpenApiRouteSchema; url: string }

/**
 * A transform to run underneath the audience decision, typically
 * `jsonSchemaTransform` from `fastify-type-provider-zod`.
 *
 * Looser than `SwaggerTransform` on purpose: a schema-less route is handed
 * down as `schema: undefined`, which every `SwaggerTransform` in practice
 * handles (`jsonSchemaTransform` returns it straight back) but none of them
 * declares.
 */
// biome-ignore lint/suspicious/noExplicitAny: must accept both SwaggerTransform and jsonSchemaTransform verbatim
export type ChainedApiDocumentationTransform = (input: any) => { schema: any; url: string }

/**
 * Key marking an internal endpoint in the internal document.
 *
 * Deliberately not `x-internal`: Scalar treats both `x-internal` and
 * `x-scalar-ignore` as "do not render this operation", so marking with either
 * would hide every internal endpoint from the very document that exists to
 * show them.
 */
export const DEFAULT_INTERNAL_MARKER_KEY = 'x-internal-endpoint'

const EXTENSION_KEY_PREFIX = 'x-'

/** Extension keys Scalar reads as "hide this operation from the reference". */
const SCALAR_HIDING_KEYS = new Set(['x-internal', 'x-scalar-ignore'])

/**
 * Reject a marker key that would not survive to the document, or that would
 * make the internal reference hide the endpoints it is meant to document.
 *
 * `@fastify/swagger` copies only `x-`-prefixed schema keys into the generated
 * operation object and silently drops the rest, so a marker without the prefix
 * never reaches the document at all. `x-internal` and `x-scalar-ignore` do
 * reach it, and Scalar then leaves the operation out of the rendered
 * reference. Both failures are silent at runtime, so they are rejected when
 * the plugin is configured.
 */
export function assertInternalMarkerKey(key: string, optionPath: string): void {
  if (!key.startsWith(EXTENSION_KEY_PREFIX) || key.length === EXTENSION_KEY_PREFIX.length) {
    throw new Error(
      [
        `${optionPath} must be an OpenAPI extension key starting with "${EXTENSION_KEY_PREFIX}"`,
        `(received "${key}"). @fastify/swagger drops every other key, so the marker would never`,
        'reach the generated document.',
      ].join(' '),
    )
  }

  if (SCALAR_HIDING_KEYS.has(key)) {
    throw new Error(
      [
        `${optionPath} must not be "${key}": @scalar/fastify-api-reference treats it as a request`,
        'to hide the operation, which would leave internal endpoints out of the internal',
        `reference. Use "${DEFAULT_INTERNAL_MARKER_KEY}" or another extension key.`,
      ].join(' '),
    )
  }
}

export type ApiDocumentationTransformOptions = {
  /**
   * `'public'` produces the customer-facing document: hidden routes stay
   * hidden. `'internal'` produces the internal one: hidden routes are shown
   * again, alongside the public ones.
   */
  audience: ApiDocumentationAudience

  /**
   * Routes kept out of *both* documents, whatever their `hide` flag says.
   *
   * `hide: true` is also how infrastructure endpoints and the documentation
   * UIs themselves keep out of the spec, and nothing in the flag says which
   * kind of hiding it was, so the internal document would otherwise end up
   * documenting the documentation.
   */
  hiddenRoutes?: readonly DocumentationRouteMatcher[]

  /**
   * Routes kept out of the public document even though they are not hidden.
   * They still appear in the internal one.
   */
  internalRoutes?: readonly DocumentationRouteMatcher[]

  /**
   * Key stamped on internal operations in the internal document, so readers
   * and downstream tooling can tell them apart from the public ones. `false`
   * turns the marking off.
   *
   * @default 'x-internal-endpoint'
   */
  internalMarkerKey?: string | false

  /**
   * Transform to run underneath this one, on the audience-adjusted schema.
   *
   * Order matters: `jsonSchemaTransform` short-circuits on `hide: true` and
   * throws away the Zod schemas, so the audience decision has to happen first.
   * Chaining here guarantees that.
   */
  transform?: ChainedApiDocumentationTransform
}

/** What the route's own flags and the configured overrides add up to. */
type RouteAudience = 'public' | 'internal' | 'hidden'

/**
 * Overrides win over the `hide` flag, and the more restrictive override wins
 * over the more permissive one: `hiddenRoutes` beats `internalRoutes`. A route
 * listed in both is a configuration mistake, and the way it resolves keeps that
 * mistake out of the public document rather than in it.
 */
function resolveRouteAudience(
  route: DocumentedRoute,
  options: ApiDocumentationTransformOptions,
): RouteAudience {
  if (matchesAnyRoute(route, options.hiddenRoutes)) return 'hidden'
  if (matchesAnyRoute(route, options.internalRoutes)) return 'internal'

  return route.schema?.hide === true ? 'internal' : 'public'
}

/**
 * Build a `@fastify/swagger` `transform` that re-derives the `hide` flag for
 * one audience.
 *
 * Route builders fail closed: an endpoint that is not customer-facing is
 * registered with `schema.hide: true`, which keeps it out of the OpenAPI
 * document. That is the right default for a customer-facing spec and the
 * wrong one for the teams consuming the service internally. This transform
 * reads the same flag as a statement about the audience, so both documents can
 * be generated from one route table.
 *
 * The route's schema is never mutated: every registered document sees the same
 * route objects, and Fastify's own validation pipeline reads them too.
 */
export function apiDocumentationTransform(
  options: ApiDocumentationTransformOptions,
): ApiDocumentationTransform {
  const { audience, internalMarkerKey = DEFAULT_INTERNAL_MARKER_KEY, transform } = options

  if (internalMarkerKey !== false) {
    assertInternalMarkerKey(internalMarkerKey, 'apiDocumentationTransform: `internalMarkerKey`')
  }

  return (input: ApiDocumentationTransformInput): ApiDocumentationTransformResult => {
    const route: DocumentedRoute = {
      url: input.url,
      method: input.route?.method ?? [],
      schema: input.schema,
    }
    const routeAudience = resolveRouteAudience(route, options)
    const hide =
      routeAudience === 'hidden' || (routeAudience === 'internal' && audience !== 'internal')

    // A route without a schema is documented by default, so a hidden one needs
    // a schema invented for it to carry the flag. A route that has nothing to
    // say keeps passing `undefined` down the chain, which is what
    // `jsonSchemaTransform` expects to see for a schema-less route.
    const schema = input.schema === undefined && !hide ? undefined : { ...input.schema, hide }

    const result = transform ? transform({ ...input, schema }) : { schema, url: input.url }
    const resultSchema: OpenApiRouteSchema = result.schema ?? {}

    return {
      url: result.url,
      schema:
        routeAudience === 'internal' && audience === 'internal' && internalMarkerKey !== false
          ? { ...resultSchema, [internalMarkerKey]: true }
          : resultSchema,
    }
  }
}
