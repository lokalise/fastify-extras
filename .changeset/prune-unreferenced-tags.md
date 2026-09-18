---
'@lokalise/fastify-extras': minor
---

`apiDocumentationPlugin`: prune top-level `tags` no operation of the document references, on by default via the new `pruneUnreferencedTags` option. Services that register a shared tag catalogue on every document no longer advertise tags for operations they do not serve (and, in the internal-vs-public split, tags only their hidden operations use). Set `pruneUnreferencedTags: false` to keep the whole catalogue; `pruneUnreferencedTags(document)` is also exported for hand-assembled documents.
