---
'@lokalise/fastify-extras': patch
---

`bullMqMetricsPlugin` options, `ObservableQueue` and the queue discoverers take ioredis `RedisOptions` instead of the deprecated `RedisConfig` from `@lokalise/node-core`, so a TLS connection can be configured with `tls`. `getFastifyAppLoggingConfig` types its log level as `string` instead of node-core's deprecated `AppConfig['logLevel']`, which was also `string`.

`useTls` was never read: the options were passed to ioredis as is, so it did not turn TLS on. Drop `useTls`, and set `tls` (for example `tls: {}`) to connect over TLS. `createRedisConfigSchema()` from `@lokalise/config` builds these options from env vars and sets `tls: {}` when `REDIS_USE_TLS` is true, so switching to it turns TLS on for connections that had `useTls: true`.
