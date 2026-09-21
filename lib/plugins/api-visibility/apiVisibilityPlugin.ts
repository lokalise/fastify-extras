import type { RouteVisibility } from '@lokalise/api-contracts'
import type { FastifyInstance, FastifyPluginCallback, FastifySchema } from 'fastify'
import fp from 'fastify-plugin'
import { ResponseSerializationError } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { safeEncode } from 'zod/v4/core'
import { derivePublicSchema } from './derivePublicSchema.js'

const DEFAULT_SOURCE_HEADER = 'x-api-source' // TODO: discuss default with the team

type PublicEncoder = (payload: unknown) => string

const buildPublicEncoders = (
  method: string | string[],
  url: string,
  responses: Record<string, unknown>,
): Record<string, PublicEncoder>  => {
  const encoders: Record<string, PublicEncoder> = {}

  for (const [statusCode, maybeSchema] of Object.entries(responses)) {
    if (!(maybeSchema instanceof z.ZodType)) continue

    const publicSchema = derivePublicSchema(maybeSchema)
    if (publicSchema === maybeSchema) continue

    encoders[statusCode] = (payload) => {

      const result = safeEncode(publicSchema, payload)
      if (result.error) throw new ResponseSerializationError(String(method), url, { cause: result.error })

      return JSON.stringify(result.data)
    }
  }

  return encoders
}

export type ApiVisibilityPluginOptions = {
  /**
   * TODO: CC TO Document
   *
   * @default 'x-api-source'
   */
  sourceHeader?: string
}

/**
 * // TODO: CC TO Document
 */
function plugin(
  fastify: FastifyInstance,
  options: ApiVisibilityPluginOptions,
  next: (error?: Error) => void,
): void {
  const sourceHeader = (options.sourceHeader ?? DEFAULT_SOURCE_HEADER).toLowerCase()
  const encodersBySchema = new WeakMap<FastifySchema, Record<string, PublicEncoder>>()

  fastify.addHook('onRoute', (route) => {
    const responses = route.schema?.response as Record<string, unknown> | undefined
    if (!route.schema || !responses) return

    const encoders = buildPublicEncoders(route.method, route.url, responses)
    if (Object.keys(encoders).length > 0) encodersBySchema.set(route.schema, encoders)
  })

  fastify.addHook('preHandler', (request, reply, done) => {
    // internal callers go through the route's normal serializer
    const isInternalCaller = request.headers[sourceHeader] === ('internal' satisfies RouteVisibility)
    if (isInternalCaller) return done()

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
