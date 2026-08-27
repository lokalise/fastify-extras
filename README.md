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
  - [OpenTelemetry Transaction Manager Plugin](#opentelemetry-transaction-manager-plugin)
  - [Datadog Transaction Manager Plugin](#datadog-transaction-manager-plugin)
  - [UnhandledException Plugin](#unhandledexception-plugin)
  - [API Documentation Plugin](#api-documentation-plugin)

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
- `@fastify/swagger`;
- `@opentelemetry/api`;
- `dd-trace`;
- `fastify`;
- `pino`;
- `bullmq`;
- `ioredis`;

`@fastify/swagger` is loaded at runtime only by the [API Documentation Plugin](#api-documentation-plugin), but the
published typings reference its types from the package root, so every consumer needs it installed.

### Optional Peer Dependencies

Only needed by the plugin that uses them, and imported when that plugin is registered, so a service that does not
register it needs nothing installed.

- `@scalar/fastify-api-reference`: [API Documentation Plugin](#api-documentation-plugin).

## Plugins

### RequestContext Provider Plugin

Plugin to:

- extend existing `FastifyRequest` with request context by setting the following:
  - `logger`, a child logger of app.log, with prepopulated properties:
    - `x-request-id`: the request ID
    - `api-endpoint`: the route URL pattern (e.g., `/`, `/:userId`)
    - `api-method`: the HTTP method (e.g., `GET`, `POST`)
    - `api-endpoint-param-{paramName}`: for each route parameter (e.g., `api-endpoint-param-userId` for `:userId` parameter)
  - `reqId`, the request-id

No options are required to register the plugin.

The `getRequestIdFastifyAppConfig()` method is exported and returns:

- `genReqId`, a function for generating the request-id;
- `requestIdHeader`, the header name used to set the request-id.

Which can be passed to Fastify during instantiation.

The `getFastifyAppLoggingConfig(appLogLevel, requestLoggingLevels?)` method is exported and returns Fastify configuration for request logging. It accepts:

- `appLogLevel`, the application log level from your app configuration;
- `requestLoggingLevels` (optional), an array of log levels that should enable request logging. Defaults to `['debug', 'trace', 'info']`.

This method returns a `logController` configuration that:
- Enables request logging only when the app log level is in `requestLoggingLevels`;
- Automatically skips logging for service utility endpoints (`/`, `/health`, `/ready`, `/live`, `/metrics`).

Example usage:
```typescript
import { getFastifyAppLoggingConfig } from '@lokalise/fastify-extras'

const app = fastify({
  ...getFastifyAppLoggingConfig(appConfig.logLevel),
})
```

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

- `bullmq` (`^5.19.0` or `^6.0.0`)
- `ioredis` (`^5.7.0` or `^6.0.0`)

Note that `bullmq` v6 no longer bundles `ioredis`, so it always has to be installed explicitly. It also dropped the `paused` job state: pausing a queue leaves its jobs in `waiting` rather than moving them onto a separate list, so for a queue paused under v6 the backlog shows up as `bullmq_jobs_count{status="waiting"}` and `status="paused"` reads `0`.

The plugin still reports `status="paused"` on both majors, because a queue paused under v5 leaves a `paused` list behind that v6 only drains once the queue is resumed — until then those jobs are real and stay visible under that label. The two counts read different Redis keys, so no job is counted twice.

If you rely on the default `BackgroundJobsBasedQueueDiscoverer`, pairing `bullmq` v6 with `@lokalise/background-jobs-common` requires that package to be on `>=15.2.0` — earlier versions only accept `bullmq` v5.

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

### OpenTelemetry Transaction Manager Plugin

Plugin to create custom OpenTelemetry spans for background jobs.

Add the plugin to your Fastify instance by registering it with the following options:

- `isEnabled`, if `true` the plugin will create spans using OpenTelemetry;
- `tracerName` (optional), the instrumentation scope name for the tracer. This identifies the instrumentation library, not the service. For service identification, configure it via OpenTelemetry SDK resource attributes (e.g., `OTEL_SERVICE_NAME` environment variable). Defaults to `'opentelemetry-transaction-manager-plugin'`;
- `tracerVersion` (optional), the instrumentation scope version for the tracer. Defaults to `'1.0.0'`;
- `maxConcurrentSpans` (optional), maximum number of concurrent spans to track. When this limit is reached, the oldest spans will be evicted and automatically ended to prevent leaks. Defaults to `2000`.

The plugin decorates your Fastify instance with an `OpenTelemetryTransactionManager`, which implements the `TransactionObservabilityManager` interface from `@lokalise/node-core`. You can inject and use the following methods:

- `start(transactionName, uniqueTransactionKey)`, starts a background span with the provided name and stores it by the unique key. Background spans are always started as root spans, so they never inherit whatever context is active on the caller's async stack. If a span is active when the transaction starts (e.g. a producer traceparent propagated together with a queue job), it is recorded as a span link, so the enqueue -> process relation stays navigable while the transaction keeps its own trace id and its own sampling decision;
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

### Datadog Transaction Manager Plugin

Plugin to create custom Datadog APM spans for background jobs using `dd-trace`. This is an alternative to the OpenTelemetry Transaction Manager plugin for applications using Datadog for observability.

**Important:** The Datadog tracer must be pre-initialized before your application starts. Use the `--import` flag to load the tracer:

```bash
node --import dd-trace/initialize.mjs app.js
```

The plugin does **not** call `tracer.init()` — it expects the tracer to already be running when the plugin loads.

Add the plugin to your Fastify instance by registering it with the following options:

- `isEnabled`, if `true` the plugin will create spans using the Datadog tracer.

The plugin decorates your Fastify instance with a `DatadogTransactionManager`, which implements the `TransactionObservabilityManager` interface from `@lokalise/node-core`. You can inject and use the following methods:

- `start(transactionName, uniqueTransactionKey)`, starts a background span with the provided name and stores it by the unique key;
- `startWithGroup(transactionName, uniqueTransactionKey, transactionGroup)`, starts a background span with an additional `transaction.group` tag;
- `stop(uniqueTransactionKey)`, ends the span referenced by the unique key;
- `addCustomAttribute(attrName, attrValue)`, adds a custom tag to the currently active span. `attrValue` can be a string, number, or boolean;
- `addCustomAttributes(uniqueTransactionKey, atts)`, adds multiple tags to the span identified by the unique key;
- `setUserID(userId)`, sets the `usr.id` tag on the active span (Datadog convention);
- `setControllerName(name, action)`, sets `code.namespace` and `code.function` tags on the active span.

Example usage:

```typescript
import { datadogTransactionManagerPlugin } from '@lokalise/fastify-extras'

// Register the plugin
await app.register(datadogTransactionManagerPlugin, {
  isEnabled: true,
})

// Use in your application
const manager = app.datadogTransactionManager

// Start a transaction
manager.start('process-email-job', 'job-123')

// Add custom attributes
manager.addCustomAttributes('job-123', {
  jobType: 'email',
  recipient: 'user@example.com',
})

// End the transaction
manager.stop('job-123')
```

> **Note:** This plugin requires `dd-trace` as a peer dependency (`>=5.0.0`). The tracer must be initialized externally via `node --import dd-trace/initialize.mjs app.js` — the plugin only obtains the already-running tracer singleton.

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

**Related utilities:**

- `AmplitudeAdapter` - A type-safe wrapper that validates events using Zod schemas before sending them to Amplitude
- `FakeAmplitude` - A utility class for testing environments that doesn't send events to Amplitude
See the [Amplitude utilities section](#amplitude) for detailed documentation and examples.

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

### API Documentation Plugin

Serves two API references off one route table: the customer-facing one and the internal one, both rendered by
[`@scalar/fastify-api-reference`](https://github.com/scalar/scalar/tree/main/integrations/fastify). The plugin registers
[`@fastify/swagger`](https://github.com/fastify/fastify-swagger) twice, once per audience, and points a Scalar instance
at each document.

Neither package is loaded until the plugin is registered. `@scalar/fastify-api-reference` is an optional peer
dependency; `@fastify/swagger` is a required one, since the published typings reference its types:

```bash
npm i @fastify/swagger @scalar/fastify-api-reference
```

#### What separates the two documents

`schema.hide`. Route builders that resolve contract visibility (`@lokalise/api-contracts`, and the
`opinionated-machine` builders on top of it) already set it on everything that is not customer-facing, so the audience
decision is made before this plugin sees the route.

| Route                       | Public reference | Internal reference                             |
| --------------------------- | ---------------- | ---------------------------------------------- |
| no `hide`, or `hide: false` | documented       | documented                                     |
| `hide: true`                | hidden           | documented, marked `x-internal-endpoint: true` |
| matched by `hiddenRoutes`   | hidden           | hidden                                         |
| matched by `publicRoutes`   | documented       | documented                                     |
| matched by `internalRoutes` | hidden           | documented, marked                             |

The internal reference is a superset: it documents the public endpoints too, and marks the ones that are internal.

#### Routes hidden by default

`hiddenRoutes` defaults to the exported `DEFAULT_HIDDEN_ROUTES`, the endpoints a service exposes for infrastructure
rather than for callers. Each entry matches the url exactly or as a path prefix.

| Matcher          | Hides                                                                | Registered by                                             |
| ---------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| `/`              | the root route only, since `/` is not read as a prefix of every url    | `commonHealthcheckPlugin`, `commonSyncHealthcheckPlugin`     |
| `/health`        | `/health` and everything under it, such as `/health/ready`            | `publicHealthcheckPlugin`, the common healthcheck plugins   |
| `/metrics`       | `/metrics` and everything under it                                   | `metricsPlugin`                                            |
| `/documentation` | `/documentation` and everything under it, `/documentation/internal` included | this plugin                                     |

Prefix matching breaks on a path segment, so `/documentation` does not cover `/documentation-archive`.

Whatever `publicRoutePrefix` and `internalRoutePrefix` are set to is hidden on top of that list. Scalar registers its
own routes with `hide: true`, and without the exclusion the internal document would document the documentation.

#### Usage

```typescript
import { apiDocumentationPlugin } from '@lokalise/fastify-extras'
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod'

await app.register(apiDocumentationPlugin, {
  openapi: { info: { title: 'Users API', version: '1.0.0' } },
  exposeInternalDocumentation: true,
  transform: jsonSchemaTransform,
  transformObject: jsonSchemaTransformObject,
  internalHooks: { onRequest: requireInternalNetwork },
})
```

Register it before the routes it should document. `@fastify/swagger` collects routes through an `onRoute` hook, and a
hook only sees what is registered after it.

That serves:

- `/documentation/`, the public reference, with `/documentation/openapi.json` and `/documentation/openapi.yaml` for the
  document itself;
- `/documentation/internal/`, the internal reference, with the same two document endpoints under it.

The internal reference is opt-in. `exposeInternalDocumentation` defaults to `false`, which builds no internal document
and registers none of its routes, so there is nothing to reach until a service asks for it. That document lists every
endpoint the public one hides, along with their schemas, and the plugin puts no authentication in front of it, so
`internalHooks` is where an authentication or network check goes, and `exposeInternalDocumentation: !isProduction` is
the shape for a service that wants it only outside production.

`hooks` covers both references. `internalHooks` merges over it per hook name, the way
`internalScalarConfiguration` merges over `scalarConfiguration`, so a check written for the public reference guards
the internal one too until something replaces it. The internal document is a superset of the public one, so a service
that guards the smaller surface never ends up with the larger one open.

`openapi` is required. `@fastify/swagger` reads the presence of that key as the choice between OpenAPI 3 and
Swagger 2.0, and a Swagger 2.0 document cannot carry the component references the transforms produce.

#### Overriding the audience of a route

`hiddenRoutes`, `publicRoutes` and `internalRoutes` all take a list of matchers. A string matches the url exactly or as
a path prefix, a regular expression is tested against the url, and a function receives `{ url, method, schema }` for
anything else. Urls are the Fastify ones, with `:param` placeholders rather than the `{param}` form the document uses.

```typescript
await app.register(apiDocumentationPlugin, {
  openapi: { info: { title: 'Users API', version: '1.0.0' } },
  // adds to the defaults rather than replacing them
  hiddenRoutes: [...DEFAULT_HIDDEN_ROUTES, '/internal-metrics'],
  // published even though the route builder hid it
  publicRoutes: ['/legacy/tokens'],
  // kept out of the public document even though the route builder did not hide it
  internalRoutes: [/^\/admin\//, ({ method }) => method === 'DELETE'],
})
```

`hiddenRoutes` replaces `DEFAULT_HIDDEN_ROUTES` rather than adding to it, hence the spread. A route matched by more
than one list resolves to the most restrictive: `hiddenRoutes` beats `internalRoutes`, which beats `publicRoutes`.

#### Models

Hiding an operation does not remove the schemas behind it. `fastify-type-provider-zod`'s `jsonSchemaTransformObject`
writes the entire Zod registry into `components.schemas` in one pass over the finished document, and never sees which
operations the route-level transform hid. `app.addSchema` shared schemas land there the same way. Both Scalar and
`@fastify/swagger-ui` render `components.schemas` as their models panel, so an internal-only response shape in the
public document is not merely present in the JSON, a reader sees its name and its fields on screen.

The plugin therefore prunes every `components` entry the document's own operations do not reference, transitively,
before serving it. Three parts of that are worth expecting rather than being surprised by:

- The provider emits a `Foo` and a `FooInput` per registered schema. Pruning keeps only the direction actually used, so
  a response-only schema loses its `Input` twin, and the panel is shorter than the registry even for a document with
  nothing internal in it.
- Self-referential models (the Zod 4 getter pattern) survive: the walk is cycle-safe.
- `components.securitySchemes` is never pruned, since security schemes are referenced by name from `security`
  requirements rather than by `$ref`.

Set `pruneUnreferencedComponents: false` for a document that deliberately publishes a schema catalogue beyond what its
operations reference. `pruneUnreachableComponents(document)` is also exported on its own, for services that assemble
their documents by hand.

Scalar's `configuration: { hideModels: true }` hides the panel but leaves the schemas in the document. Prune for the
leak, hide for the noise.

#### Marking internal operations

Operations that are internal are marked `x-internal-endpoint: true` in the internal document. Deliberately not
`x-internal`: Scalar reads both `x-internal` and `x-scalar-ignore` as a request to leave the operation out of the
reference, which would hide every internal endpoint from the document that exists to show them. Both keys are rejected
when passed as `internalMarkerKey`, along with any key without the `x-` prefix, which `@fastify/swagger` drops before
it reaches the document. `internalMarkerKey: false` turns the marking off.

#### Options

| Option                        | Default                                       | Description                                                                  |
| ----------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| `openapi`                     | required                                      | Document metadata (`info`, `servers`, `security`, `tags`) for both documents  |
| `internalOpenapi`             | `openapi`, with `(internal)` added to the title | Metadata for the internal document. Replaces `openapi`, not merged into it |
| `publicRoutePrefix`           | `/documentation`                              | Where the public reference is served                                          |
| `internalRoutePrefix`         | `/documentation/internal`                     | Where the internal reference is served                                        |
| `exposeInternalDocumentation` | `false`                                       | Whether the internal document is built and served at all                      |
| `hiddenRoutes`                | `DEFAULT_HIDDEN_ROUTES`                       | Routes kept out of both documents                                             |
| `publicRoutes`                | -                                             | Routes published in the public document even though they are hidden           |
| `internalRoutes`              | -                                             | Routes kept out of the public document even though they are not hidden        |
| `internalMarkerKey`           | `x-internal-endpoint`                         | Key marking internal operations, or `false`                                   |
| `transform`                   | -                                             | Route-level transform, typically `jsonSchemaTransform`                        |
| `transformObject`             | -                                             | Document-level transform, typically `jsonSchemaTransformObject`               |
| `pruneUnreferencedComponents` | `true`                                        | Drop `components` entries no operation of the document references             |
| `scalarConfiguration`         | -                                             | Passed through to Scalar for both references                                  |
| `internalScalarConfiguration` | -                                             | Scalar configuration for the internal reference only                          |
| `hooks`                       | -                                             | `onRequest` / `preHandler` hooks for both references                          |
| `internalHooks`               | `hooks`                                       | Hooks for the internal reference, merged over `hooks` per hook name            |
| `logLevel`                    | -                                             | Log level for the routes both references register                             |
| `documentDecorator`           | `swagger`                                     | Decorator holding the public document                                         |
| `internalDocumentDecorator`   | `internalSwagger`                             | Decorator holding the internal document                                       |

Both documents stay available programmatically, as `app.swagger()` and `app.internalSwagger()`. The
`internalSwagger` decorator only exists where `exposeInternalDocumentation` is on.

## Utilities

### amplitude

#### FakeAmplitude

`FakeAmplitude` is a utility class that extends `Amplitude` but doesn't send any events to Amplitude. This is useful for
testing environments or when you want to disable event tracking without changing your application code.

Example usage:

```typescript
import { FakeAmplitude } from '@lokalise/fastify-extras'

// In your test or development environment
const amplitude = new FakeAmplitude()

// track() will not send any events
amplitude.track({
  event_type: 'button_clicked',
  user_id: 'user-123',
})
```

The `track()` method returns a promise that resolves to `null` immediately, maintaining the same interface as the real
`Amplitude` class without actually sending data.

#### AmplitudeAdapter

`AmplitudeAdapter` is a type-safe wrapper around `Amplitude` that uses Zod schemas to validate events before sending them.
This ensures that all events sent to Amplitude conform to predefined schemas, catching errors at compile-time and runtime.

**Key features:**

- Type-safe event tracking with TypeScript
- Automatic validation using Zod schemas
- Prevents sending malformed events to Amplitude

**Example usage:**

```typescript
import { z } from 'zod'
import { AmplitudeAdapter, AMPLITUDE_BASE_MESSAGE_SCHEMA, Amplitude } from '@lokalise/fastify-extras'
import type { AmplitudeMessage } from '@lokalise/fastify-extras'

// Define your event schemas
const eventSchemas = {
  buttonClicked: {
    schema: AMPLITUDE_BASE_MESSAGE_SCHEMA.extend({
      event_type: z.literal('button_clicked'),
      event_properties: z.object({
        button_id: z.string(),
        page: z.string(),
      }),
    }),
  },
  userSignedUp: {
    schema: AMPLITUDE_BASE_MESSAGE_SCHEMA.extend({
      event_type: z.literal('user_signed_up'),
      event_properties: z.object({
        plan: z.enum(['free', 'premium']),
      }),
    }),
  },
} as const satisfies Record<string, AmplitudeMessage>

const eventSchemaValues = Object.values(eventSchemas)
type SupportedEvents = typeof eventSchemaValues

// Create the adapter
const amplitude = new Amplitude(true)
const amplitudeAdapter = new AmplitudeAdapter<SupportedEvents>({ amplitude })

// Track events with type safety
amplitudeAdapter.track(eventSchemas.buttonClicked, {
  user_id: 'user-123',
  event_properties: {
    button_id: 'submit-btn',
    page: '/checkout',
  },
})

// With groups
amplitudeAdapter.track(eventSchemas.userSignedUp, {
  user_id: 'user-456',
  groups: { company: 'acme-corp' },
  event_properties: {
    plan: 'premium',
  },
})
```

**Schema validation:**

The `AMPLITUDE_BASE_MESSAGE_SCHEMA` provides the base schema that all events must extend. It requires:

- `event_type`: A literal string identifying the event
- `user_id`: A non-empty string or the literal `'SYSTEM'`
- `groups` (optional): A record of group names to values

When defining custom events, extend this base schema with your specific `event_type` and `event_properties`:

```typescript
const myEventSchema = AMPLITUDE_BASE_MESSAGE_SCHEMA.extend({
  event_type: z.literal('my_custom_event'),
  event_properties: z.object({
    // Your custom properties with validation
    count: z.number().int().positive(),
    status: z.enum(['active', 'inactive']),
  }),
})
```

If validation fails, a `ZodError` will be thrown, preventing invalid data from being sent to Amplitude.

### errors

#### createErrorHandler

`createErrorHandler` creates a shared error handler to be passed to `fastify.setErrorHandler`. It resolves any thrown
error to a standardized `{ message, errorCode, details? }` payload, reports 5xx errors via the provided `errorReporter`
and logs them.

Example usage:

```typescript
import { createErrorHandler } from '@lokalise/fastify-extras'

app.setErrorHandler(
  createErrorHandler({
    errorReporter,
    // optional overrides:
    // resolveResponseObject: (error) => ({ statusCode, headers?, payload }) | undefined,
    // resolveLogObject: (error) => logObject | undefined,
  }),
)
```

**Optional hooks:**

- `resolveResponseObject` — maps an error to the response; return `undefined` to fall back to the default mapping.
  The returned object may include `headers`, which are applied to the response, e.g.
  `resolveResponseObject: (error) => error instanceof CapacityError ? { statusCode: 503, headers: { 'retry-after': '30' }, payload } : undefined`.
- `resolveLogObject` — builds the object logged for 5xx errors; return `undefined` to fall back to the default log
  object.

The default error-to-response mapping is exported as `defaultResolveResponseObject`, so services can reuse it
outside the fastify handler and only prepend their own branches, e.g.
`const responseObject = myBranches(error) ?? defaultResolveResponseObject(error)`.

**Server-Sent Events support:**

The error handler is aware of routes streaming Server-Sent Events via `@fastify/sse` (including SSE contract routes
built with `@lokalise/fastify-api-contracts` >= 6). When an error reaches the handler while an SSE stream is live —
detected as `reply.sse?.isConnected && reply.raw.headersSent` — the status line and headers are already committed, so a
regular error response is impossible. Instead, the resolved error payload (the status code is ignored) is sent as a
terminal event before closing the stream:

```
event: error
data: {"message":"Internal server error","errorCode":"INTERNAL_SERVER_ERROR"}
```

Error reporting and logging happen for stream errors too. Both detection conditions are required: `@fastify/sse` sets
`isConnected` in its context constructor, before the route handler runs, so the flag alone is true on every SSE-capable
request — including ones that fail before any stream started (e.g. a response-serialization failure on the JSON
representation of a dual JSON/SSE route). Those are still answered as regular error responses; only `headersSent`
distinguishes an actually started stream.

`@fastify/sse` is not a dependency of this package — apps without the plugin registered are completely unaffected.

### route-utilities

#### authPreHandlers

- `createStaticTokenAuthPreHandler` - creates pre handler tha expects a static token in the `Authorization` header. If value is different from the expected token, it will return a 401 response.
