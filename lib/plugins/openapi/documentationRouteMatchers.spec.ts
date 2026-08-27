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

    it('matches a string as a path prefix', () => {
      expect(matchesAnyRoute(route('/documentation/openapi.json'), ['/documentation'])).toBe(true)
    })

    it('does not match a string that is only a character prefix', () => {
      expect(matchesAnyRoute(route('/health-history'), ['/health'])).toBe(false)
    })

    it('treats the root route as an exact match rather than a prefix of everything', () => {
      expect(matchesAnyRoute(route('/'), ['/'])).toBe(true)
      expect(matchesAnyRoute(route('/users'), ['/'])).toBe(false)
    })

    it('handles a matcher with a trailing slash', () => {
      expect(matchesAnyRoute(route('/documentation/js/scalar.js'), ['/documentation/'])).toBe(true)
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
      const hidden = ['/', '/health', '/health/ready', '/metrics', '/metrics/collect']
      const documented = ['/users', '/healthy-habits', '/metrics-explained']

      for (const url of hidden) {
        expect(matchesAnyRoute(route(url), DEFAULT_HIDDEN_ROUTES)).toBe(true)
      }
      for (const url of documented) {
        expect(matchesAnyRoute(route(url), DEFAULT_HIDDEN_ROUTES)).toBe(false)
      }
    })

    /**
     * The documentation's own routes are excluded by url rather than by
     * prefix, so the defaults do not reach into a subtree the service may own
     * endpoints in. See the plugin spec for the exclusion that replaces it.
     */
    it('does not claim the /documentation subtree', () => {
      expect(matchesAnyRoute(route('/documentation/guides'), DEFAULT_HIDDEN_ROUTES)).toBe(false)
      expect(matchesAnyRoute(route('/documentation'), DEFAULT_HIDDEN_ROUTES)).toBe(false)
    })
  })
})
