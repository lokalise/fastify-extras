# fastify-extras 🧩

Reusable plugins for Fastify.

* [Dependency Management](#dependency-management)
* [Plugins](#plugins)
  
  * [RequestContext Provider Plugin](#requestcontext-provider-plugin)
  * [Public Healthcheck Plugin](#public-healthcheck-plugin)
  * [Split IO Plugin](#split-io-plugin)
  * [BugSnag Plugin](#bugsnag-plugin)
  * [Metrics Plugin](#metrics-plugin)
  * [NewRelic Transaction Manager Plugin](#newrelic-transaction-manager-plugin)

## Dependency Management

The following needs to be taken into consideration when adding new runtime dependency for the `fastify-extras` package:

* If dependency is an implementation detail, and end consumer is not expected to import and use the dependency directly, it should be a `dependency`;
* If dependency needs to be imported and used by consumer directly for it to function properly, it should be a `peerDependency`.

### Dependencies

* `@bugsnag/js`;
* `@opentelemetry/api`;
* `@opentelemetry/exporter-trace-otlp-grpc`;
* `@opentelemetry/instrumentation`;
* `@opentelemetry/resources`;
* `@opentelemetry/sdk-trace-base`;
* `@opentelemetry/sdk-trace-node`;
* `@opentelemetry/semantic-conventions`;
* `@prisma/instrumentation`;
* `@splitsoftware/splitio`;
* `fastify-metrics`;
* `fastify-plugin`;
* `tslib`.

### Peer Dependencies

* `@fastify/request-context`;
* `fastify`;
* `newrelic`;
* `pino`.

## Plugins

### RequestContext Provider Plugin

Plugin to:
* extend existing `FastifyRequest` with request context by setting the following:
  * `logger`, an instance of `FastifyBaseLogger`;
  * `reqId`, the request-id;
* store the request-id in Asynchronous Local Storage to be picked up by instrumentation tooling (e. g. OpenTelemetry).

No options are required to register the plugin.

The `getRequestIdFastifyAppConfig()` method is exported and returns:
* `genReqId`, a function for generating the request-id;
* `requestIdHeader`, the header name used to set the request-id.

Which can be passed to Fastify during instantiation.

### Public Healthcheck Plugin

Plugin to monitor app status through public healthcheck.

Add the plugin to your Fastify instance by registering it with the following options:
* `healthChecks`, a list of promises with healthcheck in the callback;
* `responsePayload` (optional), the response payload that the public healthcheck should return. If no response payload is provided, the default response is:
  ```json
  {"heartbeat": "HEALTHY"}
  ```

Your Fastify app will reply with the status of the app when hitting the `GET /` route.

### Split IO Plugin

Plugin to handle feature flags in Split IO.

Add the plugin to your Fastify instance by registering it with the following options:
* `isEnabled`, if `true` the plugin will connect to [Split IO](https://split.io) using the provided `apiKey` and store data in memory with background syncing;
* `apiKey`, your SDK key;
* `debugMode`;
* `localhostFilePath` (optional), used to utilize the SDK in [localhost mode](https://help.split.io/hc/en-us/articles/360020564931-Node-js-SDK#localhost-mode). It corresponds to the full path to a file with the mapping of feature flag name to treatment. `apiKey` will be automatically replaced with `localhost` if `localhostFilePath` is provided.

The plugin decorates your Fastify instance with a `SplitIOFeatureManager`, which you can inject and use to leverage the following methods:

* `init()`, returns a promise that resolves once the SDK has finished loading. It's called automatically when registering the plugin;
* `getTreatment()`, returns the proper treatment based on the feature flag name and the key in input. Expected parameters are:
  * `key`, the ID of the user/account/etc. you're trying to evaluate a treatment for;
  * `splitName`, the Split IO feature flag name;
  * `attributes` (optional), a set of [Attributes](https://help.split.io/hc/en-us/articles/360020448791-JavaScript-SDK#attribute-syntax) used in evaluation to further decide whether to show the on or off treatment;

  > **_NOTE:_** If `isEnabled` is false, `getTreatement()` will return `control` to signal disabled treatment.
* `getTreatmentWithConfig()`, used to leverage [dynamic configurations with your treatment](https://help.split.io/hc/en-us/articles/360026943552). It accepts the same parameters as `getTreatment()`, but the response structure is as follows:
  ```ts
  type TreatmentResult = {
    treatment: string,
    config: string | null
  };
  ```
  > **_NOTE:_** If `isEnabled` is false, `getTreatementWithConfig()` will return `control` as `treatment` and `null` as `config` to signal disabled treatment.
* `track()`, used to record any actions your customers perform. Returns a boolean to indicate whether or not the SDK was able to successfully queue the event. Expected parameters are:
  * `key`, the ID of the user/account/etc. you're trying to evaluate a treatment for;
  * `trafficType`, the [traffic type](https://help.split.io/hc/en-us/articles/360019916311-Traffic-type) of the key;
  * `eventType`, the event type that this event should correspond to;
  * `value` (optional), the value to be used in creating the metric;
  * `properties`(optional), an object of key value pairs that represent the [properties](https://help.split.io/hc/en-us/articles/360027333612-Event-property-capture-) to be used to filter your metrics;
* `shutdown()`, gracefully shuts down the client.

More info about Split IO can be checked [here](https://help.split.io/hc/en-us/articles/360020564931-Node-js-SDK).

### BugSnag Plugin

Plugin to report errors to BugSnag.

Add the plugin to your Fastify instance by registering it with the following options:
* `isEnabled`;
* `bugsnag`, a set of customizable [xonfiguration options](https://docs.bugsnag.com/platforms/javascript/configuration-options/).

Once the plugin has been added to your Fastify instance and loaded, errors will be reported to BugSnag.

### Metrics Plugin

Plugin to expose Prometheus metrics.

Add the plugin to your Fastify instance by registering it with the following options:
* `loggerOptions`, used to configure the internal logger instance. It can be a boolean or a set of [Pino options](https://getpino.io/#/docs/api?id=options). By default it is set to `false` and the logger is disabled;
* `disablePrometheusRequestLogging` (optional). By default Fastify will issue an `info` level log message when a request is received and when the response for that request has been sent. By setting this option to `true`, these log messages will be disabled. Defaults to `true`;
* `bindAddress` (optional). By default, the server will listen on the address(es) resolved by localhost when no specific host is provided. See the possible values for host when targeting localhost [here](https://fastify.dev/docs/latest/Reference/Server#listen);
* `errorObjectResolver`, a resolver method that, given an `err` and optionally a `correlationID`, it will log the error if something goes wrong.

The plugin exposes a `GET /metrics` route in your Fastify app to retrieve Prometheus metrics. If something goes wrong while starting the Prometheus metrics server, an `Error` is thrown. Otherwise, a success message is displayed when the plugin has been loaded.

### NewRelic Transaction Manager Plugin

Plugin to create custom NewRelic spans for background jobs.

Add the plugin to your Fastify instance by registering it with the following options:
* `isEnabled`.

The plugin decorates your Fastify instance with a `NewRelicTransactionManager`, which you can inject and use to leverage the following methods:
* `start()`, which takes a `jobName`, and starts a background transaction with the provided name;
* `stop()`, which takes a `jobId`, and ends the background transaction referenced by the ID;
* `addCustomAttribute()`, which takes `attrName` and `attrValue` and records the custom attribute as such defined. `attrValue` can be a string, a number, or a boolean.

### Amplitude Plugin

This plugin facilitates the transmission of events to Amplitude.

To add this plugin to your Fastify instance, register it with the following configurations:
* `isEnabled`: A flag utilized to activate or de-activate the plugin.
* `apiKey` (optional): This refers to the Amplitude API key which can be procured from your respective Amplitude project.
* `options` (optional): To configure Amplitude, please refer to [this documentation](https://amplitude.github.io/Amplitude-TypeScript/modules/_amplitude_analytics_node.Types.html#NodeOptions).
* `apiUsageTracking` (optional): You can use this callback to generate an event that will automatically be sent for tracking API usage. Non-specification of this feature will lead to disabling of API tracking.
* `plugins` (optional): This feature allows you to expand the plugin's functionality, from altering event properties to relaying to third-party APIs. To learn more, visit [this link](https://www.docs.developers.amplitude.com/data/sdks/typescript-node/#plugins).

The plugin decorates your Fastify instance with a `Amplitude`, which you can inject and use the `track` method on it to send events whenever you need

> 📘 To ensure optimal functionality with this plugin, you may need to incorporate Amplitude types into your development dependencies.
> ```
> "@amplitude/analytics-types": "*"
> ```
