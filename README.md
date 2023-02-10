# fastify-extras

Reusable plugins for fastify

## Dependency management

The following needs to be taken into consideration when adding new runtime dependency for the `fastify-extras` package:

* If dependency is an implementation detail, and end consumer is not expected to import and use the dependency directly, it should be a `dependency`;
* If dependency needs to be imported and used by consumer directly for it to function properly, it should be a `peerDependency`.

### Split IO plugin

Plugin has 3 modes:
- `enabled`  - will connect to [](https://split.io) using provided `apiKey` and store data in memory with background sync
- `localhost` - will use `localhost` mode with features provided in a file via param `localhostFilePath`
- `disabled` - on any request to `SplitIOFeatureManager` it will return `controle` treatment

More info about Split IO can be checked [here](https://help.split.io/hc/en-us/articles/360020564931-Node-js-SDK)
