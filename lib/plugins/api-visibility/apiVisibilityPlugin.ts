import type { RouteVisibility } from '@lokalise/api-contracts'
import type {} from '@lokalise/fastify-api-contracts' // Pulls the `FastifyContextConfig.apiContract` augmentation
import type {
  FastifyContextConfig,
  FastifyInstance,
  FastifyPluginCallback,
  FastifyRequest,
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
const PUBLIC_ENCODERS = Symbol('fastify-extras:apiVisibility:encoders')
type PublicEncoder = (payload: unknown) => string

declare module 'fastify' {
  interface FastifyContextConfig {
    [PUBLIC_ENCODERS]?: Record<string, PublicEncoder>
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
 * Anything else — an unresolved (unmarked) route or an invalid value — resolves
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
  // A route registered before it would bypass hooks and leak, so fail loud instead.
  if (fastify.printRoutes().trim() !== '(empty tree)') {
    next(new Error('apiVisibilityPlugin must be registered before the routes'))
    return
  }

  fastify.setValidatorCompiler(validatorCompiler)
  fastify.setSerializerCompiler(serializerCompiler)

  const sourceHeader = (options.sourceHeader ?? DEFAULT_SOURCE_HEADER).toLowerCase()
  const alwaysPublicPathPrefixes = options.alwaysPublicPathPrefixes ?? []

  fastify.addHook('onRequest', (request, reply, done) => {
    if (request.is404) return done()
    if (isAlwaysPublicPath(request.url, alwaysPublicPathPrefixes)) return done()

    const isPublicCaller = !isInternalCaller(request, sourceHeader)
    const visibility = resolveVisibility(request.routeOptions.config)
    if (isPublicCaller && visibility === 'internal') return reply.callNotFound()

    done()
  })

  fastify.addHook('onRoute', (route) => {
    const responses = route.schema?.response as Record<string, unknown> | undefined
    if (!responses || !route.config) return

    const encoders = buildPublicEncoders(route.method, route.url, responses)
    if (!encoders) return

    route.config[PUBLIC_ENCODERS] = encoders
  })

  fastify.addHook('preHandler', (request, reply, done) => {
    // Internal callers go through the route's normal serializer untouched.
    if (isInternalCaller(request, sourceHeader)) return done()

    const encoders = request.routeOptions.config[PUBLIC_ENCODERS]
    if (!encoders) return done()

    reply.serializer((payload: unknown) => {
      // Installing a serializer makes `reply.send` skip the branch that sets the
      // default content-type, so set it here to match what internal callers get
      reply.header('content-type', 'application/json; charset=utf-8')

      const statusCode = String(reply.statusCode)
      const encode = encoders[statusCode] ?? encoders[`${statusCode[0]}xx`] ?? encoders.default
      if (!encode)
        throw new ResponseSerializationError(request.method, request.url, {
          cause: new z.core.$ZodError([
            {
              code: 'custom',
              path: [],
              input: undefined,
              message: `No response encoder for status code ${statusCode}`,
            },
          ]),
        })

      return encode(payload)
    })

    done()
  })

  next()
}

export const apiVisibilityPlugin: FastifyPluginCallback<ApiVisibilityPluginOptions> = fp(plugin, {
  fastify: '5.x',
  name: 'api-visibility-plugin',
})
