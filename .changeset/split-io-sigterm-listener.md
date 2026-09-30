---
'@lokalise/fastify-extras': patch
---

splitIOFeatureManagerPlugin: remove the SIGTERM listener the Split SDK registers internally for its own cleanup. The plugin already handles cleanup by destroying the client from its onClose hook, and the SDK listener could terminate the process before the application's graceful shutdown finished.
