import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * A ~120 line router built on the History API.
 *
 * The stack for this project is React + Vite and nothing else, so rather than pull in a routing
 * library this does the three things the app actually needs: keep the URL in sync with rendered
 * state, match `/customers/:id` style patterns, and expose a `navigate()` that works from anywhere.
 */

const RouterContext = createContext(null);

function readLocation() {
  return {
    path: window.location.pathname || '/',
    search: window.location.search || '',
    hash: window.location.hash || '',
  };
}

export function RouterProvider({ children }) {
  const [location, setLocation] = useState(readLocation);

  useEffect(() => {
    const sync = () => setLocation(readLocation());
    window.addEventListener('popstate', sync);
    window.addEventListener('routeledger:navigate', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('routeledger:navigate', sync);
    };
  }, []);

  useEffect(() => {
    // Deep links land at the top of the page, the same as a full document load would.
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.path]);

  const query = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const out = {};
    params.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }, [location.search]);

  const value = useMemo(() => ({ ...location, query }), [location, query]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useLocation() {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useLocation must be used inside <RouterProvider>.');
  }
  return context;
}

/** Imperative navigation. Safe to call from event handlers, axios interceptors and effects. */
export function navigate(to, options = {}) {
  const target = String(to || '/');
  const current = `${window.location.pathname}${window.location.search}`;
  if (target === current && !options.force) {
    return;
  }
  if (options.replace) {
    window.history.replaceState({}, '', target);
  } else {
    window.history.pushState({}, '', target);
  }
  window.dispatchEvent(new Event('routeledger:navigate'));
}

/** An anchor that keeps middle-click and ctrl-click behaving like a real link. */
export function Link({ to, children, className, onClick, ...rest }) {
  const handle = (event) => {
    if (onClick) onClick(event);
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} className={className} onClick={handle} {...rest}>
      {children}
    </a>
  );
}

/**
 * Matches an Express-style pattern against a path.
 * `/runs/:id` vs `/runs/42` -> `{ id: '42' }`. Returns null when it does not match.
 */
export function matchPath(pattern, path) {
  const patternParts = trim(pattern).split('/');
  const pathParts = trim(path).split('/');
  if (patternParts.length !== pathParts.length) {
    return null;
  }
  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const expected = patternParts[i];
    const actual = pathParts[i];
    if (expected.startsWith(':')) {
      if (!actual) return null;
      params[expected.slice(1)] = decodeURIComponent(actual);
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
}

/** First matching route wins; `routes` is an ordered array of `{ path, render }`. */
export function useRoutes(routes, fallback) {
  const { path } = useLocation();
  return useMemo(() => {
    for (const route of routes) {
      const params = matchPath(route.path, path);
      if (params) {
        return route.render(params);
      }
    }
    return typeof fallback === 'function' ? fallback() : fallback;
  }, [routes, path, fallback]);
}

/** True when `candidate` is the current page or one of its children. */
export function useIsActive(candidate) {
  const { path } = useLocation();
  return useCallback(
    (target = candidate) => path === target || path.startsWith(`${target}/`),
    [path, candidate],
  );
}

function trim(value) {
  return String(value || '/')
    .split('?')[0]
    .replace(/\/+$/, '')
    .replace(/^\/+/, '');
}
