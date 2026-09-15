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

/**
 * JSON-LD, serialised so it cannot end the `<script>` block that holds it.
 *
 * `JSON.stringify` does not escape `<`, so a product named
 * `Phone</script><script>…` serialises to exactly that, and whether it
 * executes then depends on how React happened to deliver the tag. Measured on
 * the built site, it does **not**: the block is inserted client-side, and a
 * script inserted that way never runs. That is an accident of the rendering
 * path, not a decision — move the tag out of its Suspense boundary and the
 * accident is gone.
 *
 * The premise it rested on is gone too. The comment beside that tag read
 * "serialised from our own database rows, never from user input", and it was
 * true when it was written; Phase 5.1 gave staff a product form, so the rows
 * are typed by a person now. A STAFF account is not an ADMIN one (§7), and
 * script running in an administrator's browser is how that difference stops
 * mattering.
 *
 * `<` is an ordinary escape inside a JSON string — a parser reads it back
 * as `<` — and inert to an HTML tokeniser, so the tag cannot be closed early.
 * `>` and `&` follow for the same price.
 */
export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
