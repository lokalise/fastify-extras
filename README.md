# fastify-extras 🧩

Reusable plugins for Fastify.

- [Dependency Management](#dependency-management)
- [Plugins](#plugins)

  - [RequestContext Provider Plugin](#requestcontext-provider-plugin)
  - [Public Healthcheck Plugin](#public-healthcheck-plugin)
  - [Split IO Plugin](#split-io-plugin)
  - [BugSnag Plugin](#bugsnag-plugin)
  - [Metrics Plugin](#metrics-plugin)
  - [Bull MQ Metrics Plugin](#bullmq-metrics-plugin)
  - [NewRelic Transaction Manager Plugin](#newrelic-transaction-manager-plugin)
  - [UnhandledException Plugin](#unhandledexception-plugin)

## Dependency Management

The following needs to be taken into consideration when adding new runtime dependency for the `fastify-extras` package:

- If dependency is an implementation detail, and end consumer is not expected to import and use the dependency directly, it should be a `dependency`;
- If dependency needs to be imported and used by consumer directly for it to function properly, it should be a `peerDependency`.

### Dependencies

- `@bugsnag/js`;
- `@splitsoftware/splitio`;
- `fastify-metrics`;
- `fastify-plugin`;
- `tslib`.

### Peer Dependencies

- `@fastify/jwt`;
- `fastify`;
- `newrelic`;
- `pino`;
- `bullmq`;

## Plugins

### RequestContext Provider Plugin

Plugin to:

- extend existing `FastifyRequest` with request context by setting the following:
  - `logger`, a child logger of app.log, with prepopulated header `x-request-id`;
  - `reqId`, the request-id;

No options are required to register the plugin.

The `getRequestIdFastifyAppConfig()` method is exported and returns:

- `genReqId`, a function for generating the request-id;
- `requestIdHeader`, the header name used to set the request-id.

Which can be passed to Fastify during instantiation.

### Public Healthcheck Plugin

Plugin to monitor app status through public healthcheck.

Add the plugin to your Fastify instance by registering it with the following options:

- `healthChecks`, a list of promises with healthcheck in the callback;
- `responsePayload` (optional), the response payload that the public healthcheck should return. If no response payload is provided, the default response is:
  ```json
  { "heartbeat": "HEALTHY" }
  ```

Your Fastify app will reply with the status of the app when hitting the `GET /` route.

### Split IO Plugin

Plugin to handle feature flags in Split IO.

Add the plugin to your Fastify instance by registering it with the following options:

- `isEnabled`, if `true` the plugin will connect to [Split IO](https://split.io) using the provided `apiKey` and store data in memory with background syncing;
- `apiKey`, your SDK key;
- `debugMode`;
- `localhostFilePath` (optional), used to utilize the SDK in [localhost mode](https://help.split.io/hc/en-us/articles/360020564931-Node-js-SDK#localhost-mode). It corresponds to the full path to a file with the mapping of feature flag name to treatment. `apiKey` will be automatically replaced with `localhost` if `localhostFilePath` is provided.

The plugin decorates your Fastify instance with a `SplitIOFeatureManager`, which you can inject and use to leverage the following methods:

- `init()`, returns a promise that resolves once the SDK has finished loading. It's called automatically when registering the plugin;
- `getTreatment()`, returns the proper treatment based on the feature flag name and the key in input. Expected parameters are:

  - `key`, the ID of the user/account/etc. you're trying to evaluate a treatment for;
  - `splitName`, the Split IO feature flag name;
  - `attributes` (optional), a set of [Attributes](https://help.split.io/hc/en-us/articles/360020448791-JavaScript-SDK#attribute-syntax) used in evaluation to further decide whether to show the on or off treatment;

  > **_NOTE:_** If `isEnabled` is false, `getTreatement()` will return `control` to signal disabled treatment.

- `getTreatmentWithConfig()`, used to leverage [dynamic configurations with your treatment](https://help.split.io/hc/en-us/articles/360026943552). It accepts the same parameters as `getTreatment()`, but the response structure is as follows:
  ```ts
  type TreatmentResult = {
    treatment: string
    config: string | null
  }
  ```
  > **_NOTE:_** If `isEnabled` is false, `getTreatementWithConfig()` will return `control` as `treatment` and `null` as `config` to signal disabled treatment.
- `track()`, used to record any actions your customers perform. Returns a boolean to indicate whether or not the SDK was able to successfully queue the event. Expected parameters are:
  - `key`, the ID of the user/account/etc. you're trying to evaluate a treatment for;
  - `trafficType`, the [traffic type](https://help.split.io/hc/en-us/articles/360019916311-Traffic-type) of the key;
  - `eventType`, the event type that this event should correspond to;
  - `value` (optional), the value to be used in creating the metric;
  - `properties`(optional), an object of key value pairs that represent the [properties](https://help.split.io/hc/en-us/articles/360027333612-Event-property-capture-) to be used to filter your metrics;
- `shutdown()`, gracefully shuts down the client.

More info about Split IO can be checked [here](https://help.split.io/hc/en-us/articles/360020564931-Node-js-SDK).

### BugSnag Plugin

Plugin to report errors to BugSnag.

Add the plugin to your Fastify instance by registering it with the following options:

- `isEnabled`;
- `bugsnag`, a set of customizable [xonfiguration options](https://docs.bugsnag.com/platforms/javascript/configuration-options/).

Once the plugin has been added to your Fastify instance and loaded, errors will be reported to BugSnag.

### Metrics Plugin

Plugin to expose Prometheus metrics.

Add the plugin to your Fastify instance by registering it with the following options:

- `loggerOptions`, used to configure the internal logger instance. It can be a boolean or a set of [Pino options](https://getpino.io/#/docs/api?id=options). By default it is set to `false` and the logger is disabled;
- `disablePrometheusRequestLogging` (optional). By default Fastify will issue an `info` level log message when a request is received and when the response for that request has been sent. By setting this option to `true`, these log messages will be disabled. Defaults to `true`;
- `bindAddress` (optional). By default, the server will listen on the address(es) resolved by localhost when no specific host is provided. See the possible values for host when targeting localhost [here](https://fastify.dev/docs/latest/Reference/Server#listen);
- `errorObjectResolver`, a resolver method that, given an `err` and optionally a `correlationID`, it will log the error if something goes wrong.

The plugin exposes a `GET /metrics` route in your Fastify app to retrieve Prometheus metrics. If something goes wrong while starting the Prometheus metrics server, an `Error` is thrown. Otherwise, a success message is displayed when the plugin has been loaded.

### BullMQ Metrics Plugin

Plugin to auto-discover BullMQ queues which can regularly collect metrics for them and expose via `fastify-metrics` global Prometheus registry. If used together with `metricsPlugin`, it will show these metrics on `GET /metrics` route.

This plugin depends on the following peer-installed packages:

- `bullmq`
- `ioredis`

Add the plugin to your Fastify instance by registering it with the following possible options:

- `redisClient`, a Redis client instance which is used by the BullMQ: plugin uses it to discover the queues;
- `bullMqPrefix` (optional, default: `bull`). The prefix used by BullMQ to store the queues in Redis;
- `metricsPrefix` (optional, default: `bullmq`). The prefix for the metrics in Prometheus;
- `queueDiscoverer` (optional, default: `BackgroundJobsBasedQueueDiscoverer`). The queue discoverer to use. The default one relies on the logic implemented by `@lokalise/background-jobs-common` where queue names are registered by the background job processors; If you are not using `@lokalise/background-jobs-common`, you can use your own queue discoverer by instantiating a `RedisBasedQueueDiscoverer` or implementing a `QueueDiscoverer` interface;
- `excludedQueues` (optional, default: `[]`). An array of queue names to exclude from metrics collection;
- `histogramBuckets` (optional, default: `[20, 50, 150, 400, 1000, 3000, 8000, 22000, 60000, 150000]`). Buckets for the histogram metrics (such as job completion or overall processing time).
- `collectionOptions` (optional, default: `{ type: 'interval', intervalInMs: 5000 }`). Allows to configure how metrics are collected. Supports the following properties:
  - `type`. Can be either `interval` or `manual`.
    - With `interval` type, plugin automatically loops and updates metrics at the specified interval.
    - With `manual` type, you need to call `app.bullMqMetrics.collect()` to update the metrics; that allows you to build your own logic for scheduling the updates.
  - `intervalInMs` (only for `type: 'interval'`). The interval in milliseconds at which the metrics are collected;

This plugin exposes `bullMqMetrics.collect()` method on the Fastify instance to manually trigger the metrics collection.

If something goes wrong while starting the BullMQ metrics plugin, an `Error` is thrown.

### NewRelic Transaction Manager Plugin

Plugin to create custom NewRelic spans for background jobs.

Add the plugin to your Fastify instance by registering it with the following options:

- `isEnabled`.

The plugin decorates your Fastify instance with a `NewRelicTransactionManager`, which you can inject and use to leverage the following methods:

- `start()`, which takes a `jobName`, and starts a background transaction with the provided name;
- `stop()`, which takes a `jobId`, and ends the background transaction referenced by the ID;
- `addCustomAttribute()`, which takes `attrName` and `attrValue` and records the custom attribute as such defined. `attrValue` can be a string, a number, or a boolean.

### Amplitude Plugin

This plugin facilitates the transmission of events to Amplitude.

To add this plugin to your Fastify instance, register it with the following configurations:

- `isEnabled`: A flag utilized to activate or de-activate the plugin.
- `apiKey` (optional): This refers to the Amplitude API key which can be procured from your respective Amplitude project.
- `options` (optional): To configure Amplitude, please refer to [this documentation](https://amplitude.github.io/Amplitude-TypeScript/modules/_amplitude_analytics_node.Types.html#NodeOptions).
- `apiUsageTracking` (optional): You can use this callback to generate an event that will automatically be sent for tracking API usage. Non-specification of this feature will lead to disabling of API tracking.
- `plugins` (optional): This feature allows you to expand the plugin's functionality, from altering event properties to relaying to third-party APIs. To learn more, visit [this link](https://www.docs.developers.amplitude.com/data/sdks/typescript-node/#plugins).

The plugin decorates your Fastify instance with a `Amplitude`, which you can inject and use the `track` method on it to send events whenever you need

> 📘 To ensure optimal functionality with this plugin, you may need to incorporate Amplitude types into your development dependencies.
>
> ```
> "@amplitude/analytics-types": "*"
> ```

Additionally, you have the option to enhance the safety and accuracy of your events and properties by wrapping your `Amplitude` instance with `AmplitudeAdapter`.

> 📘Check [`AmplitudeAdapter.spec.ts](./lib/plugins/amplitude/amplitudePlugin.spec.ts) for a practical example

### UnhandledException Plugin

This plugin provides a mechanism for handling uncaught exceptions within your Fastify application, ensuring that such exceptions are logged and reported. It's especially useful for capturing unforeseen exceptions and provides a controlled shutdown of the Fastify server, thereby ensuring no potential data corruption.

#### Setup & Configuration

To integrate this plugin into your Fastify instance, follow these steps:

1. First, import the necessary types and the plugin:

```typescript
import { FastifyInstance } from 'fastify'
import { unhandledExceptionPlugin, ErrorObjectResolver } from '@lokalise/fastify-extras'
```

2. Configure the plugin:

Define your own `ErrorObjectResolver` to dictate how the uncaught exceptions will be structured for logging. Here's an example:

```typescript
const myErrorResolver: ErrorObjectResolver = (err, correlationID) => {
  return {
    error: err,
    id: correlationID,
  }
}
```

You'll also need to provide an `ErrorReporter` instance. This instance should have a `report` method to handle the error reporting logic. For example:

```typescript
import { ErrorReporter } from '@lokalise/node-core'

const myErrorReporter = new ErrorReporter(/* initialization params */)
```

3. Register the plugin with your Fastify instance:

```typescript
const fastify = Fastify()

fastify.register(unhandledExceptionPlugin, {
  errorObjectResolver: myErrorResolver,
  errorReporter: myErrorReporter,
})
```

#### Options

The plugin accepts the following options:

- `errorObjectResolver` (required): This function determines the structure of the error object which will be logged in case of an uncaught exception.

- `errorReporter` (required): An instance of the ErrorReporter which will handle reporting of the uncaught exceptions.

#### Working Principle

When an uncaught exception occurs, the plugin:

- Logs the exception using the provided `errorObjectResolver`.

- Reports the exception using the `ErrorReporter`.

- Shuts down the Fastify server gracefully.

- Exits the process with exit code `1`.

#### Dependencies

- `@lokalise/node-core`: For error reporting.

- `fastify`: The framework this plugin is designed for.

> 🚨 It's critical to note that this plugin listens to the process's 'uncaughtException' event. Multiple listeners on this event can introduce unpredictable behavior in your application. Ensure that this is the sole listener for this event or handle interactions between multiple listeners carefully.

## Utilities

### route-utilities

#### authPreHandlers

- `createStaticTokenAuthPreHandler` - creates pre handler tha expects a static token in the `Authorization` header. If value is different from the expected token, it will return a 401 response.
