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
 * A string matches the url exactly or as a path prefix, so `/documentation`
 * also covers `/documentation/openapi.json` but not `/documentation-archive`.
 * A regular expression is tested against the url. A function receives the
 * whole route, which is the form to use for method-specific rules.
 */
export type DocumentationRouteMatcher = string | RegExp | ((route: DocumentedRoute) => boolean)

/**
 * Routes kept out of both documents unless the service says otherwise.
 *
 * These are the endpoints every Lokalise service exposes for infrastructure
 * rather than for callers: the root route, the healthcheck endpoints and the
 * Prometheus scrape endpoint. Prefix matching covers `/health/ready` and
 * friends along with them.
 *
 * The documentation's own routes are not on this list. The plugin excludes
 * them by url instead, from the set the reference scopes actually registered,
 * which is exact where a prefix is a guess: a service owning a real
 * `/documentation/guides/:slug` endpoint keeps it documented.
 *
 * The two prefixes that remain are still guesses, and a service whose domain
 * puts real endpoints under them (`/health/tips` for a healthcare API,
 * `/metrics/daily` for an analytics one) has to say so, since this plugin
 * has no way to know which routes the healthcheck and metrics plugins
 * registered. Prefix matching breaks on a path segment, so only the subtree
 * is affected: `/health-history` and `/healthy-habits` are documented.
 *
 * Exported so a service that wants to add to the list rather than replace it
 * can spread it into its own `hiddenRoutes`, or filter an entry out of it.
 */
export const DEFAULT_HIDDEN_ROUTES: readonly DocumentationRouteMatcher[] = [
  '/',
  '/health',
  '/metrics',
]

function matchesUrlPrefix(url: string, prefix: string): boolean {
  if (url === prefix) return true

  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
  // `/` is the root route, not a prefix of every route there is.
  if (base === '') return false

  return url === base || url.startsWith(`${base}/`)
}

function matches(route: DocumentedRoute, matcher: DocumentationRouteMatcher): boolean {
  if (typeof matcher === 'string') return matchesUrlPrefix(route.url, matcher)
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
