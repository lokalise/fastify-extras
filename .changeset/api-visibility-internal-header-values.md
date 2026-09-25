---
'@lokalise/fastify-extras': minor
---

apiVisibilityPlugin:

- Add an `internalAudienceValues` option (a string or an array, default `['internal']`) to customize which audience header values identify an internal caller.
- Rename the `sourceHeader` option to `audienceHeader`. `sourceHeader` keeps working as a deprecated alias and is ignored when `audienceHeader` is set.
