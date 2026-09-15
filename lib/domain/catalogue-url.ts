/**
 * The catalogue's URL, without Zod.
 *
 * These helpers were in `schemas/catalogue.ts`, next to the parser that
 * validates the same params — which reads well and cost 351 kB. Three client
 * components import them (the filter panel, the toolbar, the pager), and
 * importing anything from a module whose first line is `import { z } from
 * 'zod'` pulls the whole Zod runtime into the browser. Measured on the built
 * site, that was **a third of the catalogue page's JavaScript**, shipped so a
 * checkbox could edit a query string.
 *
 * Nothing here needs validating: these take `URLSearchParams` and return a
 * string. The parsing — which does need Zod, because the values come from the
 * address bar and therefore from anyone — stays in `schemas/catalogue.ts`,
 * where only the server imports it.
 */

/**
 * The sort orders, in the order a customer meets them.
 *
 * The single source of truth: `server/queries/catalogue.ts` derives its
 * `CatalogueSort` union from this array, and the Zod enum is built from it too,
 * so the three cannot drift (§13.16).
 */
export const SORT_VALUES = [
  'newest',
  'price_asc',
  'price_desc',
  'best_selling',
] as const;

export type CatalogueSortValue = (typeof SORT_VALUES)[number];

/**
 * Apply changes to the current query string.
 *
 * Any change resets pagination — silently leaving `page=4` after a filter
 * narrows the results to one page shows an empty grid, and the customer reads
 * that as "you have nothing", not "you are on page four".
 */
export function buildCatalogueQuery(
  current: URLSearchParams,
  changes: Record<string, string | string[] | null>,
): string {
  const next = new URLSearchParams(current);

  for (const [key, value] of Object.entries(changes)) {
    if (value == null || (Array.isArray(value) && value.length === 0) || value === '') {
      next.delete(key);
    } else {
      next.set(key, Array.isArray(value) ? value.join(',') : value);
    }
  }

  if (!('page' in changes)) next.delete('page');

  const query = next.toString();
  return query ? `?${query}` : '';
}

/** Toggle one value inside a comma-separated param. */
export function toggleCsvValue(
  current: URLSearchParams,
  key: string,
  value: string,
): string[] {
  const existing = (current.get(key) ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return existing.includes(value)
    ? existing.filter((entry) => entry !== value)
    : [...existing, value];
}
