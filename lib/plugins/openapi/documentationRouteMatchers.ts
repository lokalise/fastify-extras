import type { FastifySchema } from 'fastify'

/**
 * A Fastify route schema as `@fastify/swagger` sees it: the standard Fastify
 * fields plus the swagger-specific extras the documentation plugin reads and
 * writes.
 */
export type OpenApiRouteSchema = FastifySchema & {
  /** When true, `@fastify/swagger` leaves the route out of the document. */
  hide?: boolean
  summary?: string
  description?: string
  tags?: readonly string[]
}

/** The route as the `@fastify/swagger` `transform` hook sees it. */
export type DocumentedRoute = {
  /**
   * The Fastify route url, with `:param` placeholders rather than the
   * `{param}` form the generated document uses, and including whatever prefix
   * the enclosing plugin scope added.
   */
  url: string
  method: string | string[]
  schema?: OpenApiRouteSchema
}

/**
 * Matches a route by url or by an arbitrary predicate.
 *
 * A string matches the url and nothing else: `/health` covers `/health`, not
 * `/health/ready` and not `/healthz`. Listing one route never takes a claim
 * on the url space beneath it, so a service can own `/documentation/guides`
 * or `/health/tips` without this plugin having an opinion about it.
 *
 * A regular expression is tested against the url, which is the form to reach
 * for when a subtree really is the target (`/^/admin//`). A function
 * receives the whole route, for method-specific rules.
 */
export type DocumentationRouteMatcher = string | RegExp | ((route: DocumentedRoute) => boolean)

/**
 * Routes kept out of both documents unless the service says otherwise.
 *
 * These are the urls the sibling plugins in this package register, not
 * guesses at a shape. `commonHealthcheckPlugin` and
 * `commonSyncHealthcheckPlugin` register `/` and `/health`,
 * `publicHealthcheckPlugin` registers `/health`, and all of them set
 * `schema.hide: true`, which this plugin otherwise reads as "internal, put it
 * in the internal document".
 *
 * `/metrics` is here for a service that exposes a Prometheus scrape endpoint
 * on its main app. This package's own `metricsPlugin` does not need it: it
 * passes `endpoint: null` to `fastify-metrics` and serves `/metrics` from a
 * separate server on its own port, so that route is never in the documented
 * app's route table to begin with.
 *
 * Matching is exact, so none of these reaches into the url space below it. A
 * service that owns `/health/tips` or `/metrics/daily` keeps them documented,
 * and one that moves a healthcheck (`publicHealthcheckPlugin` takes a `url`)
 * replaces this list with the urls it actually configured.
 *
 * The documentation's own routes are not here either. The plugin excludes
 * those separately, from the set of urls the reference scopes registered.
 *
 * Exported so a service can spread it into its own `hiddenRoutes` rather than
 * retyping it.
 */
export const DEFAULT_HIDDEN_ROUTES: readonly DocumentationRouteMatcher[] = [
  '/',
  '/health',
  '/metrics',
]

function matches(route: DocumentedRoute, matcher: DocumentationRouteMatcher): boolean {
  // Exact, deliberately. A prefix would let one listed route decide the fate
  // of every route registered beneath it, silently and at a distance.
  if (typeof matcher === 'string') return route.url === matcher
  if (typeof matcher === 'function') return matcher(route)

  // A `g`-flagged regexp carries `lastIndex` between calls, which would make
  // matching depend on the order routes happen to be registered in.
  matcher.lastIndex = 0
  return matcher.test(route.url)
}

/** Whether any of the matchers accepts the route. */
export function matchesAnyRoute(
  route: DocumentedRoute,
  matchers: readonly DocumentationRouteMatcher[] | undefined,
): boolean {
  if (matchers === undefined) return false

  return matchers.some((matcher) => matches(route, matcher))
}
