import {
  DEFAULT_HIDDEN_ROUTES,
  type DocumentedRoute,
  matchesAnyRoute,
} from './documentationRouteMatchers.js'

const route = (url: string, method: string | string[] = 'GET'): DocumentedRoute => ({
  url,
  method,
})

describe('documentationRouteMatchers', () => {
  describe('matchesAnyRoute', () => {
    it('matches a string exactly', () => {
      expect(matchesAnyRoute(route('/health'), ['/health'])).toBe(true)
    })

    it('does not match a route nested under the string', () => {
      expect(matchesAnyRoute(route('/health/ready'), ['/health'])).toBe(false)
      expect(matchesAnyRoute(route('/documentation/openapi.json'), ['/documentation'])).toBe(false)
    })

    it('does not match a string that is only a character prefix', () => {
      expect(matchesAnyRoute(route('/health-history'), ['/health'])).toBe(false)
      expect(matchesAnyRoute(route('/healthz'), ['/health'])).toBe(false)
    })

    it('treats the root route as itself rather than as the parent of everything', () => {
      expect(matchesAnyRoute(route('/'), ['/'])).toBe(true)
      expect(matchesAnyRoute(route('/users'), ['/'])).toBe(false)
    })

    it('distinguishes a trailing slash, which Fastify registers as its own route', () => {
      expect(matchesAnyRoute(route('/health/'), ['/health'])).toBe(false)
      expect(matchesAnyRoute(route('/health'), ['/health/'])).toBe(false)
    })

    it('takes a regular expression for a subtree', () => {
      expect(matchesAnyRoute(route('/admin/users'), [/^\/admin\//])).toBe(true)
      expect(matchesAnyRoute(route('/administrator'), [/^\/admin\//])).toBe(false)
    })

    it('matches a regular expression against the url', () => {
      expect(matchesAnyRoute(route('/users/:userId'), [/^\/users\//])).toBe(true)
      expect(matchesAnyRoute(route('/orders'), [/^\/users\//])).toBe(false)
    })

    it('does not let a global regular expression carry state between routes', () => {
      const matcher = /\/internal/g

      expect(matchesAnyRoute(route('/internal/one'), [matcher])).toBe(true)
      expect(matchesAnyRoute(route('/internal/two'), [matcher])).toBe(true)
    })

    it('passes the whole route to a predicate', () => {
      const matcher = (candidate: DocumentedRoute) => candidate.method === 'DELETE'

      expect(matchesAnyRoute(route('/users/:userId', 'DELETE'), [matcher])).toBe(true)
      expect(matchesAnyRoute(route('/users/:userId', 'GET'), [matcher])).toBe(false)
    })

    it('matches when any of the matchers matches', () => {
      expect(matchesAnyRoute(route('/metrics'), ['/health', '/metrics'])).toBe(true)
    })

    it('does not match without matchers', () => {
      expect(matchesAnyRoute(route('/metrics'), undefined)).toBe(false)
      expect(matchesAnyRoute(route('/metrics'), [])).toBe(false)
    })

    it('treats a trailing "*" as a literal character rather than a wildcard', () => {
      // A string matcher is exact-or-prefix, so the glob form matches nothing
      // at all and would silently disable the entry. `/documentation` already
      // covers the whole subtree, and a RegExp is the escape hatch beyond that.
      expect(matchesAnyRoute(route('/documentation/openapi.json'), ['/documentation*'])).toBe(false)
      expect(matchesAnyRoute(route('/documentation'), ['/documentation*'])).toBe(false)
    })

    it('hides the service utility endpoints by default', () => {
      const hidden = ['/', '/health', '/metrics']
      const documented = ['/users', '/healthy-habits', '/metrics-explained']

      for (const url of hidden) {
        expect(matchesAnyRoute(route(url), DEFAULT_HIDDEN_ROUTES)).toBe(true)
      }
      for (const url of documented) {
        expect(matchesAnyRoute(route(url), DEFAULT_HIDDEN_ROUTES)).toBe(false)
      }
    })

    /**
     * Every default is one url the sibling plugins in this package actually
     * register, so none of them reaches into the space a service may own
     * endpoints in. The documentation's own routes are excluded elsewhere,
     * from the set the reference scopes registered; see the plugin spec.
     */
    it('claims no url space below the endpoints it lists', () => {
      const serviceOwned = [
        '/health/tips',
        '/health/ready',
        '/metrics/daily',
        '/documentation',
        '/documentation/guides',
        '/users',
      ]

      for (const url of serviceOwned) {
        expect(matchesAnyRoute(route(url), DEFAULT_HIDDEN_ROUTES), url).toBe(false)
      }
    })
  })
})
