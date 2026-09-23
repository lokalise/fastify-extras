import type { ApiDocumentationAudience } from './apiDocumentationTransform.js'

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const LOCAL_SCHEMA_REF_PREFIX = '#/components/schemas/'
const localRefName = (schema: Record<string, unknown>): string | undefined => {
  const ref = schema.$ref
  return typeof ref === 'string' && ref.startsWith(LOCAL_SCHEMA_REF_PREFIX)
    ? ref.slice(LOCAL_SCHEMA_REF_PREFIX.length)
    : undefined
}

/**
 * Whether a schema is internal, and so must be dropped from the public document.
 */
const isInternalSchema = (schema: unknown, internalComponents: ReadonlySet<string>): boolean => {
  if (!isPlainObject(schema)) return false
  if (schema.visibility === 'internal') return true

  const refName = localRefName(schema)
  if (refName !== undefined && internalComponents.has(refName)) return true

  return (
    isInternalSchema(schema.items, internalComponents) ||
    isInternalSchema(schema.additionalProperties, internalComponents)
  )
}

/**
 * The names of the components carrying an own `visibility: 'internal'` marker.
 */
const collectInternalComponents = (schemas: Record<string, unknown> | undefined): Set<string> => {
  const names = new Set<string>()
  for (const [name, schema] of Object.entries(schemas ?? {}))
    if (isPlainObject(schema) && schema.visibility === 'internal') names.add(name)

  return names
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
 * Drop `properties` that are internal (for the public document only) and sync
 * `required`. Surviving markers are scrubbed by `walk` when it visits each node.
 */
const cleanProperties = (
  schema: Record<string, unknown>,
  audience: ApiDocumentationAudience,
  internalComponents: ReadonlySet<string>,
): void => {
  const { properties } = schema
  if (audience !== 'public' || !isPlainObject(properties)) return

  const next: Record<string, unknown> = {}
  const removed = new Set<string>()
  for (const [name, propertySchema] of Object.entries(properties)) {
    if (isInternalSchema(propertySchema, internalComponents)) {
      removed.add(name)
      continue
    }
    next[name] = propertySchema
  }

  schema.properties = next
  if (removed.size > 0) {
    const required = prunedRequired(schema.required, removed)
    if (required === undefined) schema.required = undefined
    else schema.required = required
  }
}

/**
 * Drop `parameters` whose `schema` is internal.
 */
const cleanParameters = (
  node: Record<string, unknown>,
  audience: ApiDocumentationAudience,
  internalComponents: ReadonlySet<string>,
): void => {
  const { parameters } = node
  if (audience !== 'public' || !Array.isArray(parameters)) return

  node.parameters = parameters.filter(
    (parameter) =>
      !(isPlainObject(parameter) && isInternalSchema(parameter.schema, internalComponents)),
  )
}

/**
 * Process one node in place, then recurse. Internal entries are dropped
 * and the node's own `visibility` marker scrubbed before the surviving
 * subtrees are walked.
 */
const walk = (
  node: unknown,
  audience: ApiDocumentationAudience,
  seen: WeakSet<object>,
  internalComponents: ReadonlySet<string>,
): void => {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, audience, seen, internalComponents)
    return
  }

  if (!isPlainObject(node)) return
  if (seen.has(node)) return
  seen.add(node)

  cleanProperties(node, audience, internalComponents)
  cleanParameters(node, audience, internalComponents)
  // Fully remove the marker rather than leave a `visibility: undefined` tombstone.
  // biome-ignore lint/performance/noDelete: one-shot document transform, not a hot path.
  if ('visibility' in node) delete node.visibility

  for (const value of Object.values(node)) walk(value, audience, seen, internalComponents)
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
  const components = isPlainObject(result) ? result.components : undefined
  const schemas =
    isPlainObject(components) && isPlainObject(components.schemas) ? components.schemas : undefined

  // Only the public document drops internal content
  const internalComponents =
    audience === 'public' ? collectInternalComponents(schemas) : new Set<string>()

  // Remove internal components outright.
  if (schemas) for (const name of internalComponents) delete schemas[name]

  walk(result, audience, new WeakSet(), internalComponents)

  return result
}
