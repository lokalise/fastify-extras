import type { ApiDocumentationAudience } from './apiDocumentationTransform.js'

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const withoutVisibilityMarker = (schema: Record<string, unknown>): Record<string, unknown> => {
  if (!('visibility' in schema)) return schema

  const { visibility: _dropped, ...rest } = schema
  return rest
}

/**
 * Rebuild `required` without `removed`, returning `undefined` when nothing
 * stays required so the caller can leave the key off rather than emit an empty
 * `required: []`.
 */
const prunedRequired = (required: unknown, removed: ReadonlySet<string>): string[] | undefined => {
  if (!Array.isArray(required)) return undefined

  const kept = required.filter(
    (name): name is string => typeof name === 'string' && !removed.has(name),
  )

  return kept.length > 0 ? kept : undefined
}

/**
 * Clean the `properties` of one schema node in place: for the public document,
 * drop `visibility: 'internal'` entries and sync `required`; for either
 * document, scrub the `visibility` marker from every surviving property.
 */
const cleanProperties = (
  schema: Record<string, unknown>,
  audience: ApiDocumentationAudience,
): void => {
  const { properties } = schema
  if (!isPlainObject(properties)) return

  const next: Record<string, unknown> = {}
  const removed = new Set<string>()
  for (const [name, propertySchema] of Object.entries(properties)) {
    if (
      audience === 'public' &&
      isPlainObject(propertySchema) &&
      propertySchema.visibility === 'internal'
    ) {
      removed.add(name)
      continue
    }
    next[name] = isPlainObject(propertySchema)
      ? withoutVisibilityMarker(propertySchema)
      : propertySchema
  }

  schema.properties = next
  if (removed.size > 0) {
    const required = prunedRequired(schema.required, removed)
    if (required === undefined) schema.required = undefined
    else schema.required = required
  }
}

/**
 * Clean the `parameters` array of an operation (or path item) in place: for the
 * public document, drop parameters whose `schema` is `visibility: 'internal'`;
 * for either document, scrub the marker from every surviving parameter's schema.
 */
const cleanParameters = (
  node: Record<string, unknown>,
  audience: ApiDocumentationAudience,
): void => {
  const { parameters } = node
  if (!Array.isArray(parameters)) return

  const next: unknown[] = []
  for (const parameter of parameters) {
    if (!isPlainObject(parameter) || !isPlainObject(parameter.schema)) {
      next.push(parameter)
      continue
    }
    if (audience === 'public' && parameter.schema.visibility === 'internal') continue

    parameter.schema = withoutVisibilityMarker(parameter.schema)
    next.push(parameter)
  }

  node.parameters = next
}

/**
 * Process one node in place, then recurse. Internal entries are dropped (for the
 * public document) and the `visibility` marker scrubbed before the surviving
 * subtrees are walked, so a stripped subtree is never visited.
 */
const walk = (node: unknown, audience: ApiDocumentationAudience, seen: WeakSet<object>): void => {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, audience, seen)
    return
  }

  if (!isPlainObject(node)) return
  if (seen.has(node)) return
  seen.add(node)

  cleanProperties(node, audience)
  cleanParameters(node, audience)

  for (const value of Object.values(node)) walk(value, audience, seen)
}

/**
 * Clean the field-level `visibility` markers out of an assembled OpenAPI
 * document, per audience. Returns a structural clone; the input is never
 * mutated.
 *
 * @param document The assembled OpenAPI document.
 * @param audience Which of the two generated documents this is for:
 *   - `'public'`: Removed internal fields from the output document.
 *   - `'internal'`: Keep internal fields in the output document.
 *
 *   The `visibility` marker itself is scrubbed from every surviving field in
 *   *both* audiences
 */
export function stripInternalFieldsFromDocument<Document>(
  document: Document,
  audience: ApiDocumentationAudience,
): Document {
  const result = structuredClone(document)
  walk(result, audience, new WeakSet())

  return result
}
