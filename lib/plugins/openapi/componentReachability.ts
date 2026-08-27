/**
 * Component reachability: which `components` entries a document still needs,
 * and pruning the ones it does not.
 *
 * `fastify-type-provider-zod`'s `jsonSchemaTransformObject` writes *every*
 * schema of the Zod registry into `components.schemas` in a single pass over
 * the finished document, with no knowledge of which routes the route-level
 * transform hid. Without pruning, the public document carries the request and
 * response shapes of internal endpoints, and both `@scalar/fastify-api-reference`
 * and `@fastify/swagger-ui` render them in their models panel.
 */

/**
 * Minimal structural view of an OpenAPI document. Deliberately loose: the
 * filtering below only needs `paths`, `tags` and `components`, and typing the
 * rest would force a dependency on `openapi-types`.
 */
export type OpenApiDocumentLike = {
  paths?: Record<string, Record<string, unknown> | undefined>
  tags?: Array<{ name?: string } & Record<string, unknown>>
  components?: { schemas?: Record<string, unknown> } & Record<string, unknown>
} & Record<string, unknown>

const COMPONENTS_REF_PREFIX = '#/components/'
const COMPONENT_SCHEMA_REF_PREFIX = `${COMPONENTS_REF_PREFIX}schemas/`

/**
 * Component sections pruned when nothing reachable references them.
 *
 * `securitySchemes` is deliberately absent: security schemes are referenced by
 * name from `security` requirements rather than by `$ref`, so reachability
 * says nothing about whether they are still needed. Any section not listed
 * here is likewise left alone, and, since it survives, counts as a root for
 * everything it references.
 */
const PRUNABLE_COMPONENT_SECTIONS = new Set([
  'schemas',
  'responses',
  'parameters',
  'examples',
  'requestBodies',
  'headers',
  'links',
  'callbacks',
  'pathItems',
])

/**
 * `discriminator.mapping` points at schemas with bare strings instead of
 * `$ref` objects, so a schema reachable only through a mapping would be pruned
 * and leave the discriminator dangling.
 *
 * A real Discriminator Object always carries `propertyName`, which is what
 * tells it apart from a schema property that happens to be named
 * `discriminator`. Returns whether the value was one.
 */
function collectDiscriminatorRefs(value: unknown, acc: Set<string>): boolean {
  if (typeof value !== 'object' || value === null) return false

  const { propertyName, mapping } = value as { propertyName?: unknown; mapping?: unknown }
  if (typeof propertyName !== 'string') return false

  if (typeof mapping === 'object' && mapping !== null) {
    for (const target of Object.values(mapping)) {
      if (typeof target !== 'string') continue
      // A mapping value is either an explicit reference or a schema name.
      acc.add(target.startsWith('#/') ? target : `${COMPONENT_SCHEMA_REF_PREFIX}${target}`)
    }
  }

  return true
}

function collectRefs(value: unknown, acc: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, acc)
    return
  }
  if (typeof value !== 'object' || value === null) return

  for (const [key, nested] of Object.entries(value)) {
    if (key === '$ref' && typeof nested === 'string') {
      acc.add(nested)
      continue
    }
    if (key === 'discriminator' && collectDiscriminatorRefs(nested, acc)) continue
    collectRefs(nested, acc)
  }
}

/**
 * Seed the reachability walk.
 *
 * Everything outside `components` is a root, and so is every component section
 * that is never pruned: those survive unconditionally, so whatever they point
 * at has to survive with them. Missing this second group is how a
 * `components.schemas` entry referenced only from, say, a kept
 * `components.responses` entry gets pruned out from under a live `$ref`.
 */
function collectRootRefs(document: OpenApiDocumentLike, acc: Set<string>): void {
  const { components, ...documentWithoutComponents } = document
  collectRefs(documentWithoutComponents, acc)

  for (const [section, entries] of Object.entries(components ?? {})) {
    if (PRUNABLE_COMPONENT_SECTIONS.has(section)) continue
    collectRefs(entries, acc)
  }
}

/** `section/name` of a component entry, the key reachability is tracked by. */
type ComponentId = string

function parseComponentRef(ref: string): ComponentId | undefined {
  if (!ref.startsWith(COMPONENTS_REF_PREFIX)) return undefined

  // Component keys are restricted to `[a-zA-Z0-9._-]`, so no JSON-pointer
  // escaping can appear here. Segments past the entry name (`.../Foo/items`)
  // point *into* a component, which still requires keeping the component.
  const [section, name] = ref.slice(COMPONENTS_REF_PREFIX.length).split('/')
  if (section === undefined || name === undefined || name === '') return undefined
  if (!PRUNABLE_COMPONENT_SECTIONS.has(section)) return undefined

  return `${section}/${name}`
}

function readComponent(
  components: Record<string, unknown>,
  id: ComponentId,
): { entries: Record<string, unknown>; name: string } | undefined {
  const separator = id.indexOf('/')
  const entries = components[id.slice(0, separator)]
  if (typeof entries !== 'object' || entries === null) return undefined

  return { entries: entries as Record<string, unknown>, name: id.slice(separator + 1) }
}

/**
 * Resolve which prunable component entries are still reachable, following
 * `$ref`s transitively so an entry referenced only by another kept entry
 * survives. The walk is cycle-safe, so self-referential schemas keep their own
 * reference.
 */
function resolveReachableComponents(
  document: OpenApiDocumentLike,
  components: Record<string, unknown>,
): Set<ComponentId> {
  const roots = new Set<string>()
  collectRootRefs(document, roots)
  const queue: string[] = [...roots]

  const reachable = new Set<ComponentId>()
  while (queue.length > 0) {
    const id = parseComponentRef(queue.pop() as string)
    if (id === undefined || reachable.has(id)) continue

    const component = readComponent(components, id)
    if (component === undefined || !(component.name in component.entries)) continue
    reachable.add(id)

    const nestedRefs = new Set<string>()
    collectRefs(component.entries[component.name], nestedRefs)
    queue.push(...nestedRefs)
  }

  return reachable
}

/**
 * Drop every `components` entry the document no longer references.
 *
 * Reachability follows `$ref`s transitively, so an entry referenced only by
 * another kept entry survives. `components.securitySchemes` is never pruned:
 * security schemes are referenced by name from `security` requirements rather
 * than by `$ref`.
 *
 * Skip this if the document deliberately publishes a schema catalogue beyond
 * what its operations reference: pruning is exactly what you do not want then.
 *
 * The input document is never mutated.
 *
 * The type parameter is deliberately unconstrained. `openapi-types`' `Document`
 * interfaces have no index signatures, so they do not structurally satisfy
 * {@link OpenApiDocumentLike} even though they are exactly what this is for,
 * and constraining it would reject `app.swagger()`, the one argument that
 * matters. The document is inspected defensively at runtime instead.
 */
export function pruneUnreachableComponents<Document>(document: Document): Document {
  const result = structuredClone(document)
  pruneComponentsInPlace(result as OpenApiDocumentLike)

  return result
}

/** Prune in place, for callers that already hold a private copy. */
export function pruneComponentsInPlace(document: OpenApiDocumentLike): void {
  const components = document.components
  if (components === undefined) return

  const reachable = resolveReachableComponents(document, components)

  for (const section of Object.keys(components)) {
    if (!PRUNABLE_COMPONENT_SECTIONS.has(section)) continue

    const entries = components[section]
    if (typeof entries !== 'object' || entries === null) continue

    const entryRecord = entries as Record<string, unknown>
    for (const name of Object.keys(entryRecord)) {
      if (!reachable.has(`${section}/${name}`)) delete entryRecord[name]
    }

    if (Object.keys(entryRecord).length === 0) delete components[section]
  }
}
