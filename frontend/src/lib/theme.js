/**
 * Reads design tokens out of CSS so canvas-drawn UI can share the stylesheet's palette.
 *
 * Chart.js paints to a canvas, where `var(--brand-600)` is meaningless — a colour has to be a
 * concrete string by the time it reaches the drawing context. Rather than let charts drift into
 * their own hardcoded hex (which is exactly what had happened), resolve the token at runtime from
 * `:root` and keep tokens.css the single source of truth.
 *
 * Every lookup takes a fallback, because `getComputedStyle` returns an empty string wherever the
 * stylesheet is not loaded — jsdom under Vitest, and the first paint before CSS lands.
 */

const cache = new Map();

/**
 * @param name     Token name, with or without the leading `--`.
 * @param fallback Literal colour used when the token cannot be resolved.
 */
export function token(name, fallback = 'transparent') {
  const key = name.startsWith('--') ? name : `--${name}`;
  if (cache.has(key)) return cache.get(key);

  let value = '';
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    try {
      value = window.getComputedStyle(document.documentElement).getPropertyValue(key).trim();
    } catch {
      value = '';
    }
  }

  const resolved = value || fallback;
  // Only cache a real hit; a miss during first paint should be retried, not frozen in.
  if (value) cache.set(key, resolved);
  return resolved;
}

/** Forgets resolved tokens — needed if the palette is ever swapped at runtime (e.g. a dark theme). */
export function clearTokenCache() {
  cache.clear();
}

/**
 * Same colour at partial opacity, for chart area fills.
 *
 * Handles the `#rgb`/`#rrggbb` hex the token palette uses; anything else (a named colour, an
 * existing `rgb()`) is returned untouched so a fallback can never produce invalid CSS.
 */
export function alpha(colour, opacity) {
  const hex = String(colour).trim();
  if (!hex.startsWith('#')) return hex;

  const digits = hex.slice(1);
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((d) => d + d)
          .join('')
      : digits;
  if (full.length !== 6) return hex;

  const int = Number.parseInt(full, 16);
  if (Number.isNaN(int)) return hex;

  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
