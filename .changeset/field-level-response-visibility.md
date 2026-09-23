---
"@lokalise/fastify-extras": major
---

Field-level and route-level API visibility, driven by a single `visibility` marker that is the source of truth for both the OpenAPI document and live traffic.

- New Zod metadata augmentation typing the `visibility` key (`'public' | 'internal'`) on `GlobalMeta`, so the marker is type-checked instead of silently ignored.
- OpenAPI documents become audience-aware: fields marked `.meta({ visibility: 'internal' })` are hidden from the public document and kept in the internal one, and the `visibility` marker itself is scrubbed from both.
- New `apiVisibilityPlugin`, the runtime counterpart. For a public caller (audience read from a gateway-stamped header, fail-closed) it:
  - strips response fields marked `visibility: 'internal'`, encoding against a derived public schema so internal-only fields, even required ones, never leak;
  - gates routes marked `internal` with a `404`. A route's audience comes from its `@lokalise/fastify-api-contracts` contract (`config.apiContract`) or a direct `config.visibility` marker; resolution is fail-closed, so an unmarked or invalid route is treated as internal and never accidentally exposed;
  - registers `fastify-type-provider-zod`'s validator and serializer compilers so the host app does not have to.
- The plugin throws at boot if it is registered after any route in its scope (those routes would bypass its hooks and could leak).

BREAKING:

- Raises the `@lokalise/api-contracts` peer dependency floor from `>=5.0.0` to `>=8.0.0` (the `RouteVisibility` type these features build on landed in 7.2.0, and `@lokalise/fastify-api-contracts` requires `>=8.0.0`).
- Adds `@lokalise/fastify-api-contracts` (`>=7.0.0`) as a peer dependency; `apiVisibilityPlugin` reads route visibility from the `config.apiContract` it attaches.

Consumers on api-contracts 5.x-7.x must upgrade.
