import { z } from 'zod/v4'
import { clone } from 'zod/v4/core'
import type { FieldVisibility } from '../../zod/zodMeta.ts'

/**
 * Per-derivation cache keyed by the source schema.
 */
type DerivationCache = Map<z.ZodType, z.ZodType>

/**
 * Per-derivation state: the tie-the-knot cache plus whether a field was actually
 * dropped.
 */
type DerivationContext = { cache: DerivationCache; dropped: boolean }

/**
 * Whether the `visibility: 'internal'` marker sits directly on this schema node.
 */
const hasInternalMarker = (schema: z.ZodType | z.core.$ZodType): boolean =>
  'meta' in schema && schema.meta()?.visibility === ('internal' satisfies FieldVisibility)

/**
 * Whether a field is internal, looking through the wrappers and containers the
 * marker can hide behind
 */
const isInternalField = (schema: z.core.$ZodType): boolean => {
  if (hasInternalMarker(schema)) return true

  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNonOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodPrefault ||
    schema instanceof z.ZodCatch ||
    schema instanceof z.ZodReadonly
  ) {
    return isInternalField(schema.unwrap())
  }

  if (schema instanceof z.ZodArray) return isInternalField(schema.element)
  if (schema instanceof z.ZodRecord || schema instanceof z.ZodMap) {
    return isInternalField(schema.valueType)
  }
  if (schema instanceof z.ZodSet) return isInternalField(schema.def.valueType)

  return false
}

/**
 * Rebuild a container/composite by cloning it with a child (or children)
 * swapped, keeping the rest of its definition.
 */
const clonedWith = (schema: z.ZodType, defPatch: Record<string, unknown>): z.ZodType => {
  const def = (schema as unknown as { def: Record<string, unknown> }).def
  return clone(schema, { ...def, ...defPatch } as never)
}

const derivePublicObjectSchema = (schema: z.ZodObject, ctx: DerivationContext): z.ZodObject => {
  const shape: Record<string, z.ZodType> = {}
  let changed = false

  for (const [key, property] of Object.entries<z.ZodType>(schema.shape)) {
    if (isInternalField(property)) {
      changed = true
      ctx.dropped = true
      continue
    }

    const derived = derive(property, ctx)
    if (derived !== property) changed = true

    shape[key] = derived
  }

  return changed ? (clonedWith(schema, { shape, catchall: undefined }) as z.ZodObject) : schema
}

const deriveWrapped = (
  schema: z.ZodType,
  inner: z.core.$ZodType,
  rewrap: (inner: z.ZodType) => z.ZodType,
  ctx: DerivationContext,
): z.ZodType => {
  const innerSchema = inner as z.ZodType
  const derived = derive(innerSchema, ctx)
  return derived === innerSchema ? schema : rewrap(derived)
}

const deriveOptions = (
  options: readonly z.core.$ZodType[],
  ctx: DerivationContext,
): { options: z.ZodType[]; changed: boolean } => {
  let changed = false
  const derived = options.map((option) => {
    const optionSchema = option as z.ZodType
    const next = derive(optionSchema, ctx)
    if (next !== optionSchema) changed = true

    return next
  })

  return { options: derived, changed }
}

const derivePublicUnionSchema = (schema: z.ZodUnion, ctx: DerivationContext): z.ZodType => {
  const { options, changed } = deriveOptions(schema.options, ctx)
  return changed ? clonedWith(schema, { options }) : schema
}

const derivePublicDiscriminatedUnionSchema = (
  schema: z.ZodDiscriminatedUnion,
  ctx: DerivationContext,
): z.ZodType => {
  const { options, changed } = deriveOptions(schema.options, ctx)
  return changed ? clonedWith(schema, { options }) : schema
}

const derivePublicIntersectionSchema = (
  schema: z.ZodIntersection,
  ctx: DerivationContext,
): z.ZodType => {
  const { options, changed } = deriveOptions([schema.def.left, schema.def.right], ctx)
  const [left, right] = options
  return changed && left && right ? clonedWith(schema, { left, right }) : schema
}

const containsInternalField = (schema: z.ZodType, seen: WeakSet<z.ZodType>): boolean => {
  if (seen.has(schema)) return false
  seen.add(schema)
  if (hasInternalMarker(schema)) return true

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
const deriveNode = (schema: z.ZodType, ctx: DerivationContext): z.ZodType => {
  if (schema instanceof z.ZodObject) {
    return derivePublicObjectSchema(schema, ctx)
  }

  if (schema instanceof z.ZodOptional) {
    return deriveWrapped(schema, schema.unwrap(), (inner) => inner.optional(), ctx)
  }
  if (schema instanceof z.ZodNonOptional) {
    return deriveWrapped(schema, schema.unwrap(), (inner) => inner.nonoptional(), ctx)
  }
  if (schema instanceof z.ZodNullable) {
    return deriveWrapped(schema, schema.unwrap(), (inner) => inner.nullable(), ctx)
  }
  if (schema instanceof z.ZodDefault) {
    return deriveWrapped(
      schema,
      schema.unwrap(),
      (inner) => inner.default(schema.def.defaultValue),
      ctx,
    )
  }
  if (schema instanceof z.ZodPrefault) {
    return deriveWrapped(
      schema,
      schema.unwrap(),
      (inner) => inner.prefault(schema.def.defaultValue),
      ctx,
    )
  }
  if (schema instanceof z.ZodCatch) {
    return deriveWrapped(
      schema,
      schema.unwrap(),
      (inner) => inner.catch(schema.def.catchValue),
      ctx,
    )
  }
  if (schema instanceof z.ZodReadonly) {
    return deriveWrapped(schema, schema.unwrap(), (inner) => inner.readonly(), ctx)
  }
  if (schema instanceof z.ZodArray) {
    return deriveWrapped(
      schema,
      schema.element,
      (inner) => clonedWith(schema, { element: inner }),
      ctx,
    )
  }
  if (schema instanceof z.ZodRecord) {
    return deriveWrapped(
      schema,
      schema.valueType,
      (inner) => clonedWith(schema, { valueType: inner }),
      ctx,
    )
  }
  if (schema instanceof z.ZodMap) {
    return deriveWrapped(
      schema,
      schema.valueType,
      (inner) => clonedWith(schema, { valueType: inner }),
      ctx,
    )
  }
  if (schema instanceof z.ZodSet) {
    return deriveWrapped(
      schema,
      schema.def.valueType,
      (inner) => clonedWith(schema, { valueType: inner }),
      ctx,
    )
  }
  if (schema instanceof z.ZodLazy) {
    return deriveWrapped(schema, schema.unwrap(), (inner) => z.lazy(() => inner), ctx)
  }

  // A discriminated union is a subclass of union, so it must be checked first.
  if (schema instanceof z.ZodDiscriminatedUnion) {
    return derivePublicDiscriminatedUnionSchema(schema, ctx)
  }
  if (schema instanceof z.ZodUnion) {
    return derivePublicUnionSchema(schema, ctx)
  }
  if (schema instanceof z.ZodIntersection) {
    return derivePublicIntersectionSchema(schema, ctx)
  }

  assertNoInternalField(schema)

  return schema
}

const derive = (schema: z.ZodType, ctx: DerivationContext): z.ZodType => {
  const cached = ctx.cache.get(schema)
  if (cached) return cached

  // Placeholder for the tie-the-knot: recursion back to `schema` before it is
  // finished resolves to `result` (the finished derivation) through this lazy.
  let result: z.ZodType = schema
  ctx.cache.set(
    schema,
    z.lazy(() => result),
  )

  result = deriveNode(schema, ctx)
  ctx.cache.set(schema, result)

  return result
}

/**
 * Derive the public variant of a response schema by dropping every property
 * marked `.meta({ visibility: 'internal' })`. Returns the original schema
 * unchanged when nothing was dropped.
 */
export const derivePublicSchema = (schema: z.ZodType): z.ZodType => {
  const ctx: DerivationContext = { cache: new Map(), dropped: false }
  const result = derive(schema, ctx)
  return ctx.dropped ? result : schema
}
