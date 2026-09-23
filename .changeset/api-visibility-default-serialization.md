---
'@lokalise/fastify-extras': patch
---

apiVisibilityPlugin: fall back to default JSON serialization for a public caller when a response status has no encoder (e.g. an error-handler 500 body), instead of throwing a `ResponseSerializationError`. Statuses the route declares are still encoded through the derived public schema, so internal fields are stripped as before.
