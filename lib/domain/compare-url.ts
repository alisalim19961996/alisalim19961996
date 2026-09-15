import { isValidSlug } from './product';

/**
 * The comparison's URL.
 *
 * A comparison is a thing worth sending to somebody — "which of these two,
 * then?" is the whole reason it exists — so it lives in the address bar rather
 * than in a store the link cannot carry. That is the same rule the catalogue
 * follows, and it means the page needs no client state at all.
 *
 * No Zod here, for the reason `catalogue-url.ts` states: the compare toggle on
 * every product card imports these, and importing from a module that imports
 * Zod ships Zod to the browser. The values still come from the address bar and
 * therefore from anyone, which is why every one of them is checked below
 * rather than trusted.
 */

/**
 * Four.
 *
 * Not a taste: a comparison is a table whose columns are products, and a fifth
 * column at 390px leaves 78 pixels per product. Two is the common case, four is
 * the most that can be read side by side on a phone without the table becoming
 * a horizontal scroll nobody finds.
 */
export const MAX_COMPARE = 4;

/** The query parameter, in one place, because three modules build this URL. */
export const COMPARE_PARAM = 'ids';

/**
 * The slugs a `?ids=` value actually names.
 *
 * Invalid entries are dropped rather than rejected — the same rule the
 * catalogue params follow. A shared link with one stale slug should compare
 * the rest, not answer with an error page.
 */
export function parseCompareSlugs(raw: string | null | undefined): string[] {
  if (!raw) return [];

  const seen = new Set<string>();

  for (const part of raw.split(',')) {
    const slug = part.trim().toLowerCase();
    // Deduplicated, because a product compared against itself is a column of
    // identical values and one wasted quarter of a phone screen.
    if (isValidSlug(slug)) seen.add(slug);
    if (seen.size >= MAX_COMPARE) break;
  }

  return [...seen];
}

/**
 * Add a slug, or drop it if it is already there.
 *
 * Returns the list unchanged when it is full and the slug is new, so the
 * caller can tell that nothing happened and say so — silently ignoring the
 * fifth tick is how a control stops looking like it works.
 */
export function toggleCompareSlug(current: readonly string[], slug: string): string[] {
  if (current.includes(slug)) return current.filter((entry) => entry !== slug);
  if (current.length >= MAX_COMPARE) return [...current];
  return [...current, slug];
}

/** The path a comparison of these slugs lives at, locale prefix excluded. */
export function compareHref(slugs: readonly string[]): string {
  const params = new URLSearchParams({ [COMPARE_PARAM]: slugs.join(',') });
  return `/compare?${params.toString()}`;
}
