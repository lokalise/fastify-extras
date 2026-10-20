---
"@lokalise/fastify-extras": patch
---

Fix errors reported via `reportErrorToBugsnag` / `bugsnagErrorReporter` being silently dropped. `bugsnagPlugin` now
starts Bugsnag through `@lokalise/error-utils`, so the started client and the reporting client are the same one.
