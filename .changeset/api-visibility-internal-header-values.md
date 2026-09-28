---
'@lokalise/fastify-extras': major
---

apiVisibilityPlugin:

- Add an `internalAudienceValues` option (a string or an array, default `['internal']`) to customize which audience header values identify an internal caller.
- Rename the `sourceHeader` option to `audienceHeader`. The deprecated `sourceHeader` alias has been removed.
- Remove the exported `FieldVisibility` type; use the equivalent type from `@lokalise/api-contracts`.
