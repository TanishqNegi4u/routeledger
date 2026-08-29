import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from '../lib/api.js';

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every `api.<namespace>.<method>(` reference in the app source, with where it came from. */
function collectApiCallSites(dir = SRC_ROOT, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectApiCallSites(full, found);
      continue;
    }
    if (!/\.(js|jsx)$/.test(entry)) continue;
    // The api module defines the surface; the test files below assert against it.
    if (/[\\/]lib[\\/]api\.js$/.test(full)) continue;

    const source = readFileSync(full, 'utf8');
    const pattern = /\bapi\.([A-Za-z]+)\.([A-Za-z]+)\s*\(/g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      found.push({
        namespace: match[1],
        method: match[2],
        where: relative(SRC_ROOT, full).replace(/\\/g, '/'),
      });
    }
  }
  return found;
}

describe('lib/api.js contract', () => {
  // Regression guard: api.js had drifted out of sync with its callers, so Dashboard,
  // MyRound, RunDetail, Beats and Settings all threw "is not a function" on first load.
  // Nothing in the suite caught it, because the other api tests only cover the
  // interceptor and error normalisation.
  it('exposes every method the app actually calls', () => {
    const callSites = collectApiCallSites();
    expect(callSites.length).toBeGreaterThan(0);

    const missing = callSites
      .filter(({ namespace, method }) => typeof api?.[namespace]?.[method] !== 'function')
      .map(({ namespace, method, where }) => `api.${namespace}.${method}() called in ${where}`);

    expect(missing).toEqual([]);
  });

  it('keeps the previously broken methods present', () => {
    expect(typeof api.dashboard.overview).toBe('function');
    expect(typeof api.routes.staff).toBe('function');
    expect(typeof api.runs.detail).toBe('function');
    expect(typeof api.customers.beats).toBe('function');
  });
});
