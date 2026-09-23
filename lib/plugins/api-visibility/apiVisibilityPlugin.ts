import type { RouteVisibility } from '@lokalise/api-contracts'
import type {} from '@lokalise/fastify-api-contracts' // Pulls the `FastifyContextConfig.apiContract` augmentation
import type {
  FastifyContextConfig,
  FastifyInstance,
  FastifyPluginCallback,
  FastifyRequest,
  onRequestHookHandler,
  preHandlerHookHandler,
} from 'fastify'
import fp from 'fastify-plugin'
import {
  ResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { safeEncode } from 'zod/v4/core'
import { derivePublicSchema } from './derivePublicSchema.js'

const DEFAULT_SOURCE_HEADER = 'x-api-audience'
type PublicEncoder = (payload: unknown) => string

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Route audience for the visibility gate. Contract routes get it from
     * `@lokalise/fastify-api-contracts` (`config.apiContract`); set it directly
     * to gate a non-contract (legacy) route.
     */
    visibility?: RouteVisibility
  }
}

const buildPublicEncoders = (
  method: string | string[],
  url: string,
  responses: Record<string, unknown>,
): Record<string, PublicEncoder> | null => {
  const encoders: Record<string, PublicEncoder> = {}
  let hasInternalField = false

  for (const [statusCode, maybeSchema] of Object.entries(responses)) {
    if (!(maybeSchema instanceof z.ZodType)) continue

    const publicSchema = derivePublicSchema(maybeSchema)
    if (publicSchema !== maybeSchema) hasInternalField = true

    encoders[statusCode] = (payload) => {
      const result = safeEncode(publicSchema, payload)
      if (result.error)
        throw new ResponseSerializationError(String(method), url, { cause: result.error })

      return JSON.stringify(result.data)
    }
  }

  // Zero cost for routes with no internal fields: no override, no encoders.
  return hasInternalField ? encoders : null
}

const isInternalCaller = (request: FastifyRequest, sourceHeader: string) =>
  request.headers[sourceHeader] === ('internal' satisfies RouteVisibility)

/**
 * A route's audience: the contract's `visibility` wins, then the direct
 * `config.visibility` marker. `apiContract` is optional-chained because the
 * augmentation types it as always present, but non-contract routes carry none.
 *
 * Fails closed: it only reports `public` for an explicit, valid `public` marker.
 * Anything else (an unresolved (unmarked) route or an invalid value) resolves
 * to `internal`, so a route is never accidentally exposed to public callers.
 */
const resolveVisibility = (config: FastifyContextConfig): RouteVisibility => {
  const visibility = config.apiContract?.visibility ?? config.visibility
  return visibility === 'public' ? 'public' : 'internal'
}

export type ApiVisibilityPluginOptions = {
  /**
   * Request header carrying the caller's audience, stamped by the gateway. Only
   * an exact `internal` value is treated as internal; anything else is public.
   *
   * @default 'x-api-audience'
   */
  sourceHeader?: string

  /**
   * Path prefixes exempt from the visibility gate, always reachable by public
   * callers.
   *
   * @default []
   */
  alwaysPublicPathPrefixes?: string[]
}

/** Whether `url` (ignoring any query string) is at or under one of the prefixes. */
const isAlwaysPublicPath = (url: string, prefixes: string[]): boolean => {
  if (prefixes.length === 0) return false

  const path = url.split('?', 1)[0] ?? url
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/** Append a route-scoped hook, preserving any the host already declared. */
const appendRouteHook = <Hook>(existing: Hook | Hook[] | undefined, hook: Hook): Hook | Hook[] => {
  if (existing === undefined) return hook
  return Array.isArray(existing) ? [...existing, hook] : [existing, hook]
}

/**
 * The gate, attached only to `internal` routes: a public caller gets a `404`,
 * indistinguishable from a missing route, so the route's existence is not leaked.
 * An internal caller passes through.
 */
const onRequestHook =
  (sourceHeader: string): onRequestHookHandler =>
  (request, reply, done) => {
    if (isInternalCaller(request, sourceHeader)) return done()
    reply.callNotFound()
  }

/**
 * The stripper, attached only to public-reachable routes with internal fields: for a
 * declared status it encodes a public caller's response through the derived public
 * schema so internal fields never leave. An internal caller keeps the route's normal
 * serialization. A status the route did not declare (typically an error-handler body)
 * has no encoder and falls back to default JSON serialization.
 */
const preHandlerHook =
  (sourceHeader: string, encoders: Record<string, PublicEncoder>): preHandlerHookHandler =>
  (request, reply, done) => {
    if (isInternalCaller(request, sourceHeader)) return done()

    reply.serializer((payload: unknown) => {
      // Installing a serializer makes `reply.send` skip the branch that sets the
      // default content-type, so set it here to match what internal callers get.
      reply.header('content-type', 'application/json; charset=utf-8')

      const statusCode = String(reply.statusCode)
      const encode = encoders[statusCode] ?? encoders[`${statusCode[0]}xx`] ?? encoders.default

      // No encoder for this status: the route declared no response schema for it, so
      // there are no internal fields to strip. Fall back to default JSON serialization
      // instead of failing the response with a `ResponseSerializationError`.
      return encode ? encode(payload) : JSON.stringify(payload)
    })

    done()
  }

/**
 * Enforces field-level API visibility at runtime, the counterpart to the
 * OpenAPI document cleanup. The caller's audience comes from `sourceHeader`
 * (gateway-stamped) and is fail-closed: only an exact `internal` value is
 * treated as internal, anything else is public.
 */
const plugin = (
  fastify: FastifyInstance,
  options: ApiVisibilityPluginOptions,
  next: (error?: Error) => void,
): void => {
  // The plugin needs zod's compilers; warn rather than silently replacing existing ones
  if (fastify.validatorCompiler) {
    fastify.log.warn(
      'apiVisibilityPlugin: overwriting an existing validatorCompiler; register this plugin before setting your own',
    )
  }
  if (fastify.serializerCompiler) {
    fastify.log.warn(
      'apiVisibilityPlugin: overwriting an existing serializerCompiler; register this plugin before setting your own',
    )
  }
  fastify.setValidatorCompiler(validatorCompiler)
  fastify.setSerializerCompiler(serializerCompiler)

  const sourceHeader = (options.sourceHeader ?? DEFAULT_SOURCE_HEADER).toLowerCase()
  const alwaysPublicPathPrefixes = options.alwaysPublicPathPrefixes ?? []

  fastify.addHook('onRoute', (route) => {
    const visibility = route.config ? resolveVisibility(route.config) : 'internal'
    const gated =
      visibility === 'internal' && !isAlwaysPublicPath(route.url, alwaysPublicPathPrefixes)

    if (gated) route.onRequest = appendRouteHook(route.onRequest, onRequestHook(sourceHeader))

    const responses = route.schema?.response as Record<string, unknown> | undefined
    const encoders = responses ? buildPublicEncoders(route.method, route.url, responses) : null
    if (encoders && !gated) {
      route.preHandler = appendRouteHook(route.preHandler, preHandlerHook(sourceHeader, encoders))
    }
  })

  next()
}

export const apiVisibilityPlugin: FastifyPluginCallback<ApiVisibilityPluginOptions> = fp(plugin, {
  fastify: '5.x',
  name: 'api-visibility-plugin',
})
