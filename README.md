# fastify-extras 🧩

Reusable plugins for Fastify.

- [Dependency Management](#dependency-management)
- [Plugins](#plugins)

  - [RequestContext Provider Plugin](#requestcontext-provider-plugin)
  - [Public Healthcheck Plugin](#public-healthcheck-plugin)
  - [Common Healthcheck Plugin](#common-healthcheck-plugin)
  - [Common Sync Healthcheck Plugin](#common-sync-healthcheck-plugin)
  - [Split IO Plugin](#split-io-plugin)
  - [BugSnag Plugin](#bugsnag-plugin)
  - [Metrics Plugin](#metrics-plugin)
  - [Bull MQ Metrics Plugin](#bullmq-metrics-plugin)
  - [NewRelic Transaction Manager Plugin](#newrelic-transaction-manager-plugin)
  - [OpenTelemetry Transaction Manager Plugin](#opentelemetry-transaction-manager-plugin)
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
- `@opentelemetry/api`;
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

### Common Healthcheck Plugin

Plugin to monitor app status through public and private healthchecks using asynchronous checks.

Add the plugin to your Fastify instance by registering it with the following options:

- `healthChecks`, a list of promises with healthcheck in the callback;
- `responsePayload` (optional), the response payload that the healthcheck should return. If no response payload is provided, the default response is:
  ```json
  { "heartbeat": "HEALTHY", "checks": {} }
  ```

Your Fastify app will reply with the status of the app when hitting the `GET /` public route with aggregated heartbeat from healthchecks provided, example:
```json
{
  "heartbeat": "HEALTHY"
}
```

Your Fastify app will reply with the status of the app when hitting the `GET /health` private route with detailed results from healthchecks provided, example:
```json
{
  "heartbeat": "PARTIALLY_HEALTHY",
  "checks": {
    "check1": "HEALTHY",
    "check2": "HEALTHY",
    "check3": "FAIL"
  }
}
```

### Common Sync Healthcheck Plugin

Plugin to monitor app status through public and private healthchecks using synchronous checks. **This plugin is recommended when you have healthchecks that run synchronously or are executed in the background**, as it provides better performance for such use cases.

Add the plugin to your Fastify instance by registering it with the following options:

- `healthChecks`, an array of synchronous healthcheck objects, each containing:
  - `name`, the identifier for the healthcheck;
  - `isMandatory`, boolean indicating if this healthcheck is critical for service health;
  - `checker`, a synchronous function that returns `null` on success or an `Error` on failure;
- `responsePayload` (optional), the response payload that the healthcheck should return;
- `logLevel` (optional), the log level for the healthcheck routes ('fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'), defaults to 'info';
- `infoProviders` (optional), an array of info providers to include additional metadata in the `/health` response;
- `isRootRouteEnabled` (optional), whether to enable the public `/` route, defaults to `true`.

Example usage:
```typescript
import { commonSyncHealthcheckPlugin } from '@lokalise/fastify-extras'

app.register(commonSyncHealthcheckPlugin, {
  healthChecks: [
    {
      name: 'database',
      isMandatory: true,
      checker: (app) => {
        // Synchronous check - returns null if healthy, Error if not
        return isDatabaseConnected() ? null : new Error('Database disconnected')
      }
    },
    {
      name: 'cache',
      isMandatory: false,  // Optional dependency
      checker: (app) => {
        return isCacheAvailable() ? null : new Error('Cache unavailable')
      }
    }
  ]
})
```

The plugin exposes the same routes as the async Common Healthcheck Plugin:
- `GET /` - Public route returning aggregated health status
- `GET /health` - Private route with detailed healthcheck results

The key differences from the async version:
- Uses synchronous healthcheck functions instead of promises
- Better suited for checks that are already running in the background or are inherently synchronous
- Supports mandatory vs optional healthchecks (optional failures result in `PARTIALLY_HEALTHY` status)

### Startup Healthcheck Plugin

Plugin to monitor app startup status, doing potentially more expensive checks than what is reasonable through periodic healthchecks.

Add the plugin to your Fastify instance by registering it with the following options:

- `healthChecks`, a list of asynchronous healthchecks to run at the app startup;
- `resultsLogLevel`, at what log level to report healthcheck results - default is INFO;

This is the structure of the log:
```json
{
  "heartbeat": "PARTIALLY_HEALTHY",
  "checks": {
    "check1": "HEALTHY",
    "check2": "HEALTHY",
    "check3": "FAIL"
  }
}
```

In case a non-optional healthcheck fails, an application startup will throw an error. In order to ensure that the error is thrown correctly, make sure to await the app startup:

```ts
  const app = fastify()
  await app.register(startupHealthcheckPlugin, opts)
  await app.ready()
```

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

#### `PrometheusCounterTransactionManager`

`PrometheusCounterTransactionManager` is an implementation of `TransactionObservabilityManager` that uses Prometheus 
counters to track the number of started, failed, and successful transactions. The results are automatically added to 
the `/metrics` endpoint exposed by the metrics plugin.


### BullMQ Metrics Plugin

Plugin to auto-discover BullMQ queues which can regularly collect metrics for them and expose via `fastify-metrics` global Prometheus registry. If used together with `metricsPlugin`, it will show these metrics on `GET /metrics` route.

This plugin depends on the following peer-installed packages:

- `bullmq`
- `ioredis`

Add the plugin to your Fastify instance by registering it with the following possible options:

- `redisConfigs`, Redis configurations used for BullMQ. Plugin uses them to discover the queues.
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
- `addCustomAttribute()`, which takes `attrName` and `attrValue` and adds the custom attribute to the current transaction. `attrValue` can be a string, a number, or a boolean.
- `addCustomAttributes()`, which passes `atts` map of the custom attributes to the current transaction. `_uniqueTransactionKey` argument is not used (because New Relic doesn't support setting custom attributes directly on the transaction handle), any string can be passed.

### OpenTelemetry Transaction Manager Plugin

Plugin to create custom OpenTelemetry spans for background jobs. This is an alternative to the NewRelic Transaction Manager Plugin for applications using OpenTelemetry for observability.

Add the plugin to your Fastify instance by registering it with the following options:

- `isEnabled`, if `true` the plugin will create spans using OpenTelemetry;
- `tracerName` (optional), the instrumentation scope name for the tracer. This identifies the instrumentation library, not the service. For service identification, configure it via OpenTelemetry SDK resource attributes (e.g., `OTEL_SERVICE_NAME` environment variable). Defaults to `'unknown-tracer'`;
- `tracerVersion` (optional), the instrumentation scope version for the tracer. Defaults to `'1.0.0'`;
- `maxConcurrentSpans` (optional), maximum number of concurrent spans to track. When this limit is reached, the oldest spans will be evicted and automatically ended to prevent leaks. Defaults to `2000`.

The plugin decorates your Fastify instance with an `OpenTelemetryTransactionManager`, which implements the `TransactionObservabilityManager` interface from `@lokalise/node-core`. You can inject and use the following methods:

- `start(transactionName, uniqueTransactionKey)`, starts a background span with the provided name and stores it by the unique key;
- `startWithGroup(transactionName, uniqueTransactionKey, transactionGroup)`, starts a background span with an additional `transaction.group` attribute;
- `stop(uniqueTransactionKey, wasSuccessful?)`, ends the span referenced by the unique key. Sets status to `OK` if successful (default), or `ERROR` if not;
- `addCustomAttribute(attrName, attrValue)`, adds a custom attribute to the currently active span. `attrValue` can be a string, number, or boolean;
- `addCustomAttributes(uniqueTransactionKey, atts)`, adds multiple custom attributes to the span identified by the unique key;
- `setUserID(userId)`, sets the `enduser.id` attribute on the active span;
- `setControllerName(name, action)`, sets `code.namespace` and `code.function` attributes on the active span.

Additional OpenTelemetry-specific methods:

- `getSpan(uniqueTransactionKey)`, returns the span for advanced manipulation, or `null` if not found;
- `getTracer()`, returns the underlying OpenTelemetry tracer;
- `runInSpanContext(uniqueTransactionKey, fn)`, executes a function within the context of a specific span, useful for automatic parent-child span linking.

Example usage:

```typescript
import { openTelemetryTransactionManagerPlugin } from '@lokalise/fastify-extras'

// Register the plugin
await app.register(openTelemetryTransactionManagerPlugin, {
  isEnabled: true,
  tracerName: 'my-instrumentation',
  tracerVersion: '1.0.0',
  // maxConcurrentSpans: 2000, // optional
})

// Use in your application
const manager = app.openTelemetryTransactionManager

// Start a transaction
manager.start('process-email-job', 'job-123')

// Add custom attributes
manager.addCustomAttributes('job-123', {
  jobType: 'email',
  recipient: 'user@example.com',
})

// Execute nested operations within the span context
manager.runInSpanContext('job-123', () => {
  // Child spans created here will be linked to the parent
  doSomeWork()
})

// End the transaction
manager.stop('job-123', true) // true = successful
```

> **Note:** This plugin requires `@opentelemetry/api` as a peer dependency. Make sure your application has OpenTelemetry configured with appropriate exporters (e.g., OTLP exporter) to send traces to your observability backend.

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

### Strip Trailing Slash Plugin

This plugin helps with SEO and SSR by ensuring search engines index only one version of a URL, avoiding duplicate content. It redirects URLs with a trailing slash to the version without it, making it easier for search engines to crawl your site consistently.

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
