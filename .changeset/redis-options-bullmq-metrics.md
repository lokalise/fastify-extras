---
'@lokalise/fastify-extras': major
---

`bullMqMetricsPlugin` options, `ObservableQueue` and the queue discoverers take ioredis `RedisOptions` instead of the deprecated `RedisConfig` from `@lokalise/node-core`. `getFastifyAppLoggingConfig` types its log level as `string` instead of node-core's deprecated `AppConfig['logLevel']`, which was also `string`.

Migration: pass `redisConfigs` as ioredis `RedisOptions`. The `useTls` flag is gone; it never enabled TLS here, because the options were passed to ioredis as is. To connect over TLS, set `tls` (for example `tls: {}`). `createRedisConfigSchema()` from `@lokalise/config` builds these options from env vars and sets `tls: {}` when `REDIS_USE_TLS` is true, so switching to it turns TLS on for connections that had `useTls: true`.
