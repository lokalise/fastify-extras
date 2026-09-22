import type { RouteVisibility } from '@lokalise/api-contracts'
import type { FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifySchema } from 'fastify'
import fp from 'fastify-plugin'
import {
  ResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { safeEncode } from 'zod/v4/core'
import { derivePublicSchema } from './derivePublicSchema.js'

const DEFAULT_SOURCE_HEADER = 'x-api-source' // TODO: discuss default with the team

type PublicEncoder = (payload: unknown) => string

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

export type ApiVisibilityPluginOptions = {
  /**
   * Request header carrying the caller's audience, stamped by the gateway. Only
   * an exact `internal` value is treated as internal; anything else is public.
   *
   * @default 'x-api-source'
   */
  sourceHeader?: string
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
  fastify.setValidatorCompiler(validatorCompiler)
  fastify.setSerializerCompiler(serializerCompiler)

  const sourceHeader = (options.sourceHeader ?? DEFAULT_SOURCE_HEADER).toLowerCase()
  const encodersBySchema = new WeakMap<FastifySchema, Record<string, PublicEncoder>>()

  fastify.addHook('onRoute', (route) => {
    const responses = route.schema?.response as Record<string, unknown> | undefined
    if (!route.schema || !responses) return

    const encoders = buildPublicEncoders(route.method, route.url, responses)
    if (encoders) encodersBySchema.set(route.schema, encoders)
  })

  fastify.addHook('preHandler', (request, reply, done) => {
    // Internal callers go through the route's normal serializer untouched.
    if (isInternalCaller(request, sourceHeader)) return done()

    const encoders = request.routeOptions.schema
      ? encodersBySchema.get(request.routeOptions.schema)
      : undefined
    if (!encoders) return done()

    reply.serializer((payload: unknown) => {
      const encode = encoders[String(reply.statusCode)]
      return encode ? encode(payload) : JSON.stringify(payload)
    })

    done()
  })

  next()
}

export const apiVisibilityPlugin: FastifyPluginCallback<ApiVisibilityPluginOptions> = fp(plugin, {
  fastify: '5.x',
  name: 'api-visibility-plugin',
})
