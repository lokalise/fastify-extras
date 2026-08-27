import type { FastifyDynamicSwaggerOptions, SwaggerTransformObject } from '@fastify/swagger'
import type { FastifyPluginAsync, onRequestHookHandler, preHandlerHookHandler } from 'fastify'
import fp from 'fastify-plugin'
import type { AnyFastifyInstance } from '../pluginsCommon.js'
import {
  type ApiDocumentationTransform,
  type ChainedApiDocumentationTransform,
  apiDocumentationTransform,
} from './apiDocumentationTransform.js'
import { pruneUnreachableComponents } from './componentReachability.js'
import {
  DEFAULT_HIDDEN_ROUTES,
  type DocumentationRouteMatcher,
} from './documentationRouteMatchers.js'

const DEFAULT_PUBLIC_ROUTE_PREFIX = '/documentation'
const DEFAULT_INTERNAL_ROUTE_PREFIX = '/documentation/internal'
const DEFAULT_PUBLIC_DECORATOR = 'swagger'
const DEFAULT_INTERNAL_DECORATOR = 'internalSwagger'

/**
 * The `openapi` section of the generated document: `info`, `servers`,
 * `security`, `tags` and anything else `@fastify/swagger` passes through.
 */
export type OpenApiDocumentDefinition = NonNullable<FastifyDynamicSwaggerOptions['openapi']>

/**
 * Document-level transform, as `@fastify/swagger` calls it. This is where
 * `fastify-type-provider-zod`'s `jsonSchemaTransformObject` goes.
 */
export type ChainedApiDocumentationTransformObject = SwaggerTransformObject

export type ApiDocumentationHooks = {
  onRequest?: onRequestHookHandler
  preHandler?: preHandlerHookHandler
}

export type ApiDocumentationPluginOptions = {
  /**
   * Document metadata (`info`, `servers`, `security`, `tags`) shared by both
   * documents.
   *
   * Required, and required to be present rather than `undefined`:
   * `@fastify/swagger` reads the presence of this key as the choice between
   * OpenAPI 3 and Swagger 2.0, and a Swagger 2.0 document cannot carry the
   * component references the transforms produce. Passing `{}` is enough to
   * select OpenAPI 3, though a document with no `info` is not valid OpenAPI.
   */
  openapi: OpenApiDocumentDefinition

  /**
   * Metadata for the internal document. It replaces `openapi` rather than
   * merging into it, so pass a whole document definition.
   *
   * Left out, the internal document reuses `openapi` with `(internal)`
   * appended to `info.title`, which is what tells the two references apart on
   * screen.
   */
  internalOpenapi?: OpenApiDocumentDefinition

  /**
   * Where the public API reference is served. The reference itself is at
   * `<prefix>/`, the document at `<prefix>/openapi.json` and
   * `<prefix>/openapi.yaml`.
   *
   * @default '/documentation'
   */
  publicRoutePrefix?: `/${string}`

  /**
   * Where the internal API reference is served, with the same layout.
   *
   * @default '/documentation/internal'
   */
  internalRoutePrefix?: `/${string}`

  /**
   * Whether the internal reference is served at all. Off by default: the
   * internal document lists every endpoint the public one hides, along with
   * their schemas, and it carries no authentication of its own, so a service
   * turns it on once it has decided who may read it. `internalHooks` is
   * where that check goes.
   *
   * Left `false`, neither the internal document nor its routes are created,
   * so there is nothing to reach.
   *
   * @default false
   */
  exposeInternalDocumentation?: boolean

  /**
   * Routes kept out of *both* documents.
   *
   * Defaults to {@link DEFAULT_HIDDEN_ROUTES}. Passing a list replaces that
   * default rather than adding to it, so spread it in to keep it:
   * `hiddenRoutes: [...DEFAULT_HIDDEN_ROUTES, '/internal-metrics']`.
   *
   * The configured documentation prefixes are always hidden on top of
   * whatever this says: the reference registers its own routes with
   * `hide: true`, and without that the internal document would document the
   * documentation.
   */
  hiddenRoutes?: readonly DocumentationRouteMatcher[]

  /**
   * Routes published in the public document even though the route builder
   * hid them.
   */
  publicRoutes?: readonly DocumentationRouteMatcher[]

  /**
   * Routes kept out of the public document even though the route builder did
   * not hide them. They still show up in the internal one.
   */
  internalRoutes?: readonly DocumentationRouteMatcher[]

  /**
   * Key stamped on internal operations in the internal document so readers
   * can tell them apart from the public ones. `false` turns it off.
   *
   * Must be an `x-` extension key, and must not be `x-internal` or
   * `x-scalar-ignore`: Scalar reads both as "leave this operation out of the
   * reference".
   *
   * @default 'x-internal-endpoint'
   */
  internalMarkerKey?: string | false

  /**
   * Route-level transform run underneath the audience decision, typically
   * `jsonSchemaTransform` from `fastify-type-provider-zod`.
   */
  transform?: ChainedApiDocumentationTransform

  /**
   * Document-level transform, typically `jsonSchemaTransformObject` from
   * `fastify-type-provider-zod`.
   */
  transformObject?: ChainedApiDocumentationTransformObject

  /**
   * Drop `components` entries no operation of the document references.
   *
   * Hiding an operation does not remove the schemas behind it:
   * `jsonSchemaTransformObject` writes the whole Zod registry into
   * `components.schemas` in one pass over the finished document, and
   * `app.addSchema` shared schemas land there too. Both UIs render those as
   * their models panel, so an internal-only response shape is not merely
   * present in the public JSON, it is on screen with its field names.
   *
   * Turn it off only for a document that deliberately publishes a schema
   * catalogue beyond what its operations reference.
   *
   * @default true
   */
  pruneUnreferencedComponents?: boolean

  /** Passed through to `@scalar/fastify-api-reference` for both references. */
  scalarConfiguration?: Record<string, unknown>

  /** Scalar configuration overrides for the internal reference only. */
  internalScalarConfiguration?: Record<string, unknown>

  /**
   * Fastify hooks for the reference routes, both the public ones and, unless
   * `internalHooks` replaces them, the internal ones.
   */
  hooks?: ApiDocumentationHooks

  /**
   * Fastify hooks for the internal reference routes. This is where an
   * authentication or network check on the internal documentation goes.
   *
   * Merged over `hooks` per hook name, the way
   * `internalScalarConfiguration` merges over `scalarConfiguration`, so a
   * check that covers the public reference covers the internal one too
   * unless this replaces it. The internal document is a superset of the
   * public one, so inheriting is the safe direction.
   */
  internalHooks?: ApiDocumentationHooks

  /** Log level for the routes both references register. */
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'

  /**
   * Fastify decorator holding the public document.
   *
   * @default 'swagger'
   */
  documentDecorator?: string

  /**
   * Fastify decorator holding the internal document.
   *
   * @default 'internalSwagger'
   */
  internalDocumentDecorator?: string
}

/**
 * Metadata for the internal document: whatever the service passed for it, or
 * the public metadata with `(internal)` appended to the title, so the two
 * references are told apart at a glance.
 *
 * `internalOpenapi` replaces the public metadata rather than merging into it.
 * Merging two `Partial<OpenAPIV3.Document | OpenAPIV3_1.Document>` values
 * produces the cross-product of both unions, which is assignable to neither
 * half, and a document assembled from halves of two different OpenAPI versions
 * is not a thing worth building anyway.
 */
function resolveInternalOpenapi(
  openapi: OpenApiDocumentDefinition,
  internalOpenapi: OpenApiDocumentDefinition | undefined,
): OpenApiDocumentDefinition {
  if (internalOpenapi !== undefined) return internalOpenapi
  if (openapi.info === undefined) return openapi

  return { ...openapi, info: { ...openapi.info, title: `${openapi.info.title} (internal)` } }
}

function buildTransformObject(
  options: ApiDocumentationPluginOptions,
): ChainedApiDocumentationTransformObject {
  const { transformObject, pruneUnreferencedComponents = true } = options

  return (input) => {
    const document = transformObject
      ? transformObject(input)
      : 'openapiObject' in input
        ? input.openapiObject
        : input.swaggerObject

    return pruneUnreferencedComponents ? pruneUnreachableComponents(document) : document
  }
}

function readDocument(app: AnyFastifyInstance, decorator: string): unknown {
  const readDocumentFn = (app as unknown as Record<string, unknown>)[decorator]
  if (typeof readDocumentFn !== 'function') {
    throw new Error(
      `apiDocumentationPlugin: expected @fastify/swagger to decorate the app with "${decorator}"`,
    )
  }

  return readDocumentFn()
}

/**
 * Serve two API references from one route table: the customer-facing one and
 * the internal one.
 *
 * `schema.hide` is what tells them apart. Route builders that resolve contract
 * visibility (`@lokalise/api-contracts` and the `opinionated-machine` route
 * builders on top of it) already set it for everything that is not
 * customer-facing, so the decision is made before this plugin sees the route:
 * a hidden route is documented in the internal reference and left out of the
 * public one, an unhidden route appears in both.
 *
 * Endpoints that carry no contract visibility, such as the healthchecks and
 * the Prometheus scrape endpoint, are hidden from both documents by default,
 * see {@link DEFAULT_HIDDEN_ROUTES}. `publicRoutes` and `internalRoutes`
 * override the flag either way for the routes they match.
 *
 * Register the plugin before the routes it should document. `@fastify/swagger`
 * collects routes through an `onRoute` hook, and a hook only sees what is
 * registered after it.
 *
 * Both references are rendered by `@scalar/fastify-api-reference`, and both
 * `@fastify/swagger` and `@scalar/fastify-api-reference` have to be installed
 * by the service. Neither is imported until this plugin is registered, so a
 * service that does not use it never loads them, but `@fastify/swagger` still
 * has to be installed for the package typings to resolve.
 *
 * @example
 * ```ts
 * await app.register(apiDocumentationPlugin, {
 *   openapi: { info: { title: 'Users API', version: '1.0.0' } },
 *   exposeInternalDocumentation: true,
 *   transform: jsonSchemaTransform,
 *   transformObject: jsonSchemaTransformObject,
 *   internalHooks: { onRequest: requireInternalNetwork },
 * })
 * ```
 */
const plugin: FastifyPluginAsync<ApiDocumentationPluginOptions> = async (
  app: AnyFastifyInstance,
  options: ApiDocumentationPluginOptions,
) => {
  const {
    publicRoutePrefix = DEFAULT_PUBLIC_ROUTE_PREFIX,
    internalRoutePrefix = DEFAULT_INTERNAL_ROUTE_PREFIX,
    exposeInternalDocumentation = false,
    hiddenRoutes = DEFAULT_HIDDEN_ROUTES,
    documentDecorator = DEFAULT_PUBLIC_DECORATOR,
    internalDocumentDecorator = DEFAULT_INTERNAL_DECORATOR,
  } = options

  const [{ default: fastifySwagger }, { default: fastifyApiReference }] = await Promise.all([
    import('@fastify/swagger'),
    import('@scalar/fastify-api-reference'),
  ])

  /**
   * Urls of the routes the two references register, filled in as they are
   * registered.
   *
   * Scalar registers its routes with `hide: true`, which is indistinguishable
   * from a route hidden because it is internal, so without an exclusion the
   * internal document documents the documentation. The route prefixes alone
   * do not cover that: a reference mounted at `/` registers `/openapi.json`
   * and friends, and `/` is deliberately not read as a prefix of every url.
   *
   * The transform reads this set when a document is generated rather than
   * when it is built, by which point every reference route is in it.
   */
  const referenceRoutes = new Set<string>()

  const registerReference = async (
    referenceOptions: Parameters<typeof fastifyApiReference>[1],
  ): Promise<void> => {
    await app.register(async (scope) => {
      scope.addHook('onRoute', (route) => {
        referenceRoutes.add(route.url)
      })
      await scope.register(fastifyApiReference, referenceOptions)
    })
  }

  const allHiddenRoutes: readonly DocumentationRouteMatcher[] = [
    ...hiddenRoutes,
    publicRoutePrefix,
    internalRoutePrefix,
    ({ url }) => referenceRoutes.has(url),
  ]

  const buildTransform = (audience: 'public' | 'internal'): ApiDocumentationTransform =>
    apiDocumentationTransform({
      audience,
      hiddenRoutes: allHiddenRoutes,
      publicRoutes: options.publicRoutes,
      internalRoutes: options.internalRoutes,
      internalMarkerKey: options.internalMarkerKey,
      transform: options.transform,
    })

  const transformObject = buildTransformObject(options)

  await app.register(fastifySwagger, {
    openapi: options.openapi ?? {},
    decorator: documentDecorator,
    transform: buildTransform('public'),
    transformObject,
  })

  if (exposeInternalDocumentation) {
    await app.register(fastifySwagger, {
      openapi: resolveInternalOpenapi(options.openapi ?? {}, options.internalOpenapi),
      decorator: internalDocumentDecorator,
      transform: buildTransform('internal'),
      transformObject,
    })
  }

  await registerReference({
    routePrefix: publicRoutePrefix,
    ...(options.logLevel && { logLevel: options.logLevel }),
    ...(options.hooks && { hooks: options.hooks }),
    configuration: {
      ...options.scalarConfiguration,
      content: () => readDocument(app, documentDecorator),
    },
  })

  if (exposeInternalDocumentation) {
    const internalHooks = { ...options.hooks, ...options.internalHooks }

    await registerReference({
      routePrefix: internalRoutePrefix,
      ...(options.logLevel && { logLevel: options.logLevel }),
      ...(Object.keys(internalHooks).length > 0 && { hooks: internalHooks }),
      configuration: {
        ...options.scalarConfiguration,
        ...options.internalScalarConfiguration,
        content: () => readDocument(app, internalDocumentDecorator),
      },
    })
  }
}

export const apiDocumentationPlugin = fp<ApiDocumentationPluginOptions>(plugin, {
  fastify: '5.x',
  name: 'api-documentation-plugin',
})
