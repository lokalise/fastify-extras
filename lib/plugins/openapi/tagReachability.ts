import type { OpenApiDocumentLike } from './componentReachability.js'

/** The string tag names a path-item member (an operation) references. */
function operationTagNames(operation: unknown): string[] {
  if (typeof operation !== 'object' || operation === null) return []

  const { tags } = operation as { tags?: unknown }
  if (!Array.isArray(tags)) return []

  return tags.filter((tag): tag is string => typeof tag === 'string')
}

/** The string tag names every member of a single path item references. */
function pathItemTagNames(pathItem: unknown): string[] {
  if (typeof pathItem !== 'object' || pathItem === null) return []

  return Object.values(pathItem).flatMap(operationTagNames)
}

/** Collect the tag names every operation of the document references. */
function collectUsedTagNames(document: OpenApiDocumentLike): Set<string> {
  const used = new Set<string>()
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const name of pathItemTagNames(pathItem)) used.add(name)
  }

  return used
}

/** The in-place worker behind {@link pruneUnreferencedTags}. */
function pruneTagsInPlace(document: OpenApiDocumentLike): void {
  const { tags } = document
  if (tags === undefined) return

  const used = collectUsedTagNames(document)
  document.tags = tags.filter((tag) => typeof tag.name !== 'string' || used.has(tag.name))
}

/**
 * Drop every top-level `tags` entry no operation of the document references.
 *
 * A tag object with no readable `name` is kept: reachability cannot speak to a
 * tag it cannot identify, and keeping it only ever leaves a description on
 * screen.
 *
 * The input document is never mutated.
 *
 * The type parameter is deliberately unconstrained, matching
 * {@link pruneUnreachableComponents}: `openapi-types`' `Document` interfaces
 * have no index signatures, so they do not structurally satisfy
 * {@link OpenApiDocumentLike} even though `app.swagger()` returns exactly that.
 */
export function pruneUnreferencedTags<Document>(document: Document): Document {
  const result = structuredClone(document)
  pruneTagsInPlace(result as OpenApiDocumentLike)

  return result
}
