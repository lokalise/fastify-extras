import { z } from 'zod/v4'
import type { FieldVisibility } from '../../zod/zodMeta.ts'

const isInternalField = (schema: z.ZodType): boolean =>
  schema.meta()?.visibility === ('internal' satisfies FieldVisibility)

const derivePublicObjectSchema = (schema: z.ZodObject): z.ZodObject => {
  const shape: Record<string, z.ZodType> = {}
  let changed = false

  for (const [key, property] of Object.entries<z.ZodType>(schema.shape)) {
    if (isInternalField(property)) {
      changed = true
      continue
    }

    const derived = derivePublicSchema(property)
    if (derived !== property) changed = true

    shape[key] = derived
  }

  return changed ? z.object(shape) : schema
}

const deriveWrapped = (
  schema: z.ZodType,
  inner: z.core.$ZodType,
  rewrap: (inner: z.ZodType) => z.ZodType,
): z.ZodType => {
  const innerSchema = inner as z.ZodType
  const derived = derivePublicSchema(innerSchema)
  return derived === innerSchema ? schema : rewrap(derived)
}

const deriveOptions = (
  options: readonly z.core.$ZodType[],
): { options: z.ZodType[]; changed: boolean } => {
  let changed = false
  const derived = options.map((option) => {
    const optionSchema = option as z.ZodType
    const next = derivePublicSchema(optionSchema)
    if (next !== optionSchema) changed = true

    return next
  })

  return { options: derived, changed }
}

const derivePublicUnionSchema = (schema: z.ZodUnion): z.ZodType => {
  const { options, changed } = deriveOptions(schema.options)
  return changed ? z.union(options) : schema
}

const derivePublicDiscriminatedUnionSchema = (schema: z.ZodDiscriminatedUnion): z.ZodType => {
  const { options, changed } = deriveOptions(schema.options)
  return changed
    ? z.discriminatedUnion(schema.def.discriminator, options as [z.ZodObject, ...z.ZodObject[]])
    : schema
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

/**
 * Derive the public variant of a response schema by dropping every property
 * marked `.meta({ visibility: 'internal' })`
 */
export const derivePublicSchema = (schema: z.ZodType): z.ZodType => {
  if (schema instanceof z.ZodObject) {
    return derivePublicObjectSchema(schema)
  }

  if (schema instanceof z.ZodArray) {
    return deriveWrapped(schema, schema.element, (inner) => z.array(inner))
  }
  if (schema instanceof z.ZodOptional) {
    return deriveWrapped(schema, schema.unwrap(), (inner) => inner.optional())
  }
  if (schema instanceof z.ZodNullable) {
    return deriveWrapped(schema, schema.unwrap(), (inner) => inner.nullable())
  }
  if (schema instanceof z.ZodRecord) {
    return deriveWrapped(schema, schema.valueType, (inner) => z.record(schema.keyType, inner))
  }
  if (schema instanceof z.ZodMap) {
    return deriveWrapped(schema, schema.valueType, (inner) => z.map(schema.keyType, inner))
  }

  // A discriminated union is a subclass of union, so it must be checked first.
  if (schema instanceof z.ZodDiscriminatedUnion) {
    return derivePublicDiscriminatedUnionSchema(schema)
  }
  if (schema instanceof z.ZodUnion) {
    return derivePublicUnionSchema(schema)
  }

  assertNoInternalField(schema)

  return schema
}
