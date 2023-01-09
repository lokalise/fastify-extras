# fastify-extras

Reusable plugins for fastify

## Dependency management

The following needs to be taken into consideration when adding new runtime dependency for the `fastify-extras` package:

* If dependency is an implementation detail, and end consumer is not expected to import and use the dependency directly, it should be a `dependency`;
* If dependency needs to be imported and used by consumer directly for it to function properly, it should be a `peerDependency`.
