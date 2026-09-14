import { locales, type Locale } from '@/i18n/routing';

/**
 * The canonical and hreflang block every page needs.
 *
 * Written once because it was already inlined in three places and five more
 * pages were about to copy it. hreflang is the kind of tag that is wrong for
 * months without anyone noticing: nothing renders differently, the site just
 * quietly competes with itself in search results for the other language.
 *
 * It only builds an object — no request, no database — so it belongs in `lib/`
 * and is unit-testable, which is the point of §17's placement rule. That rule
 * is also why the return type is declared here rather than imported as
 * `Metadata['alternates']`: `lib/` may not import from `next` at all, and the
 * shape is three lines. TypeScript checks it structurally where a page uses it.
 *
 * `path` is the route WITHOUT the locale prefix and without a trailing slash:
 * '/brands', not '/ar/brands'.
 */
export interface Alternates {
  canonical: string;
  languages: Record<string, string>;
}

export function buildAlternates(path: string, locale: Locale): Alternates {
  const clean = path === '/' ? '' : path;

  return {
    canonical: `/${locale}${clean}`,
    languages: Object.fromEntries(locales.map((code) => [code, `/${code}${clean}`])),
  };
}
