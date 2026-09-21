import { z } from 'zod/v4'
import type { FieldVisibility } from '../../zod/zodMeta.ts'

/**
 * Per-derivation cache keyed by the source schema.
 */
type DerivationCache = Map<z.ZodType, z.ZodType>

const isInternalField = (schema: z.ZodType): boolean =>
  schema.meta()?.visibility === ('internal' satisfies FieldVisibility)

const derivePublicObjectSchema = (schema: z.ZodObject, cache: DerivationCache): z.ZodObject => {
  const shape: Record<string, z.ZodType> = {}
  let changed = false

  for (const [key, property] of Object.entries<z.ZodType>(schema.shape)) {
    if (isInternalField(property)) {
      changed = true
      continue
    }

    const derived = derive(property, cache)
    if (derived !== property) changed = true

    shape[key] = derived
  }

  return changed ? z.object(shape) : schema
}

const deriveWrapped = (
  schema: z.ZodType,
  inner: z.core.$ZodType,
  rewrap: (inner: z.ZodType) => z.ZodType,
  cache: DerivationCache,
): z.ZodType => {
  const innerSchema = inner as z.ZodType
  const derived = derive(innerSchema, cache)
  return derived === innerSchema ? schema : rewrap(derived)
}

const deriveOptions = (
  options: readonly z.core.$ZodType[],
  cache: DerivationCache,
): { options: z.ZodType[]; changed: boolean } => {
  let changed = false
  const derived = options.map((option) => {
    const optionSchema = option as z.ZodType
    const next = derive(optionSchema, cache)
    if (next !== optionSchema) changed = true

    return next
  })

  return { options: derived, changed }
}

const derivePublicUnionSchema = (schema: z.ZodUnion, cache: DerivationCache): z.ZodType => {
  const { options, changed } = deriveOptions(schema.options, cache)
  return changed ? z.union(options) : schema
}

const derivePublicDiscriminatedUnionSchema = (
  schema: z.ZodDiscriminatedUnion,
  cache: DerivationCache,
): z.ZodType => {
  const { options, changed } = deriveOptions(schema.options, cache)
  return changed
    ? z.discriminatedUnion(schema.def.discriminator, options as [z.ZodObject, ...z.ZodObject[]])
    : schema
}

const derivePublicIntersectionSchema = (
  schema: z.ZodIntersection,
  cache: DerivationCache,
): z.ZodType => {
  const { options, changed } = deriveOptions([schema.def.left, schema.def.right], cache)
  const [left, right] = options
  return changed && left && right ? z.intersection(left, right) : schema
}

const containsInternalField = (schema: z.ZodType, seen: WeakSet<z.ZodType>): boolean => {
  if (seen.has(schema)) return false
  seen.add(schema)
  if (isInternalField(schema)) return true

  const definition = (schema as unknown as { def?: Record<string, unknown> }).def
  return Object.values(definition ?? {}).some((value) => childContainsInternalField(value, seen))
}

const childContainsInternalField = (value: unknown, seen: WeakSet<z.ZodType>): boolean => {
  if (value instanceof z.ZodType) return containsInternalField(value, seen)

  if (Array.isArray(value)) return value.some((item) => childContainsInternalField(item, seen))

  if (value && typeof value === 'object')
    return Object.values(value).some((item) => childContainsInternalField(item, seen))

  return false
}

const assertNoInternalField = (schema: z.ZodType): void => {
  if (!containsInternalField(schema, new WeakSet())) return

  const name = schema.constructor?.name ?? 'unknown'
  throw new Error(
    [
      `apiVisibilityPlugin: a field marked visibility: 'internal' is nested inside an unsupported Zod`,
      `construct (${name}), which cannot be rewritten to drop it. Restructure the schema so the`,
      'internal field sits in a supported construct (object, array, optional, nullable, union,',
      'discriminated union, record or map), or it would leak into public responses.',
    ].join(' '),
  )
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: It's a private helper
const deriveNode = (schema: z.ZodType, cache: DerivationCache): z.ZodType => {
  if (schema instanceof z.ZodObject) {
    return derivePublicObjectSchema(schema, cache)
  }

  if (schema instanceof z.ZodOptional) {
    return deriveWrapped(schema, schema.unwrap(), (inner) => inner.optional(), cache)
  }
  if (schema instanceof z.ZodNonOptional) {
    return deriveWrapped(schema, schema.unwrap(), (inner) => inner.nonoptional(), cache)
  }
  if (schema instanceof z.ZodNullable) {
    return deriveWrapped(schema, schema.unwrap(), (inner) => inner.nullable(), cache)
  }
  if (schema instanceof z.ZodDefault) {
    return deriveWrapped(
      schema,
      schema.unwrap(),
      (inner) => inner.default(schema.def.defaultValue),
      cache,
    )
  }
  if (schema instanceof z.ZodPrefault) {
    return deriveWrapped(
      schema,
      schema.unwrap(),
      (inner) => inner.prefault(schema.def.defaultValue),
      cache,
    )
  }
  if (schema instanceof z.ZodCatch) {
    return deriveWrapped(
      schema,
      schema.unwrap(),
      (inner) => inner.catch(schema.def.catchValue),
      cache,
    )
  }
  if (schema instanceof z.ZodReadonly) {
    return deriveWrapped(schema, schema.unwrap(), (inner) => inner.readonly(), cache)
  }
  if (schema instanceof z.ZodArray) {
    return deriveWrapped(schema, schema.element, (inner) => z.array(inner), cache)
  }
  if (schema instanceof z.ZodRecord) {
    return deriveWrapped(
      schema,
      schema.valueType,
      (inner) => z.record(schema.keyType, inner),
      cache,
    )
  }
  if (schema instanceof z.ZodMap) {
    return deriveWrapped(schema, schema.valueType, (inner) => z.map(schema.keyType, inner), cache)
  }
  if (schema instanceof z.ZodSet) {
    return deriveWrapped(schema, schema.def.valueType, (inner) => z.set(inner), cache)
  }
  if (schema instanceof z.ZodLazy) {
    return deriveWrapped(schema, schema.unwrap(), (inner) => z.lazy(() => inner), cache)
  }

  // A discriminated union is a subclass of union, so it must be checked first.
  if (schema instanceof z.ZodDiscriminatedUnion) {
    return derivePublicDiscriminatedUnionSchema(schema, cache)
  }
  if (schema instanceof z.ZodUnion) {
    return derivePublicUnionSchema(schema, cache)
  }
  if (schema instanceof z.ZodIntersection) {
    return derivePublicIntersectionSchema(schema, cache)
  }

  assertNoInternalField(schema)

  return schema
}

const derive = (schema: z.ZodType, cache: DerivationCache): z.ZodType => {
  const cached = cache.get(schema)
  if (cached) return cached

  // Placeholder for the tie-the-knot: recursion back to `schema` before it is
  // finished resolves to `result` (the finished derivation) through this lazy.
  let result: z.ZodType = schema
  cache.set(
    schema,
    z.lazy(() => result),
  )

  result = deriveNode(schema, cache)
  cache.set(schema, result)

  return result
}

/**
 * Derive the public variant of a response schema by dropping every property
 * marked `.meta({ visibility: 'internal' })`
 */
export const derivePublicSchema = (schema: z.ZodType): z.ZodType => derive(schema, new Map())
