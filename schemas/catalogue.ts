import { z } from 'zod';
import type { CatalogueFilters, CatalogueSort } from '@/server/queries/catalogue';

/**
 * Catalogue state lives in the URL, not in React state.
 *
 * That is what makes a filtered result shareable, bookmarkable, correct under
 * the back button, and indexable. It also means the values arrive as untrusted
 * strings from whatever someone typed into the address bar, so every one of
 * them is parsed and clamped here before it reaches a query.
 */

export const SORT_VALUES = [
  'newest',
  'price_asc',
  'price_desc',
  'best_selling',
] as const satisfies readonly CatalogueSort[];

export { PRODUCTS_PER_PAGE as PER_PAGE } from '@/config/ui';

/** Repeated params arrive as `a,b,c`; unknown entries are dropped, not rejected. */
const csvList = z
  .string()
  .optional()
  .transform((value) =>
    value
      ? [
          ...new Set(
            value
              .split(',')
              .map((part) => part.trim())
              .filter(Boolean),
          ),
        ]
      : [],
  );

const csvNumberList = csvList.transform((values) =>
  values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0 && value <= 4096),
);

export const catalogueParamsSchema = z.object({
  type: z.string().max(40).optional(),
  brand: csvList,
  category: csvList,
  ram: csvNumberList,
  storage: csvNumberList,
  // Prices are whole IQD; anything else is a malformed URL, not a price.
  min: z.coerce.number().int().min(0).max(2_000_000_000).optional().catch(undefined),
  max: z.coerce.number().int().min(0).max(2_000_000_000).optional().catch(undefined),
  stock: z
    .string()
    .optional()
    .transform((value) => value === '1'),
  offer: z
    .string()
    .optional()
    .transform((value) => value === '1'),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(SORT_VALUES).catch('newest'),
  page: z.coerce.number().int().min(1).max(500).catch(1),
});

export type CatalogueParams = z.infer<typeof catalogueParamsSchema>;

/** Parse raw searchParams, falling back to defaults rather than throwing. */
export function parseCatalogueParams(
  raw: Record<string, string | string[] | undefined>,
): CatalogueParams {
  // Next gives repeated keys as arrays; the first value wins so `?page=1&page=9`
  // cannot smuggle in a second meaning.
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }

  const parsed = catalogueParamsSchema.safeParse(flat);
  if (parsed.success) return parsed.data;

  return catalogueParamsSchema.parse({});
}

export function toFilters(params: CatalogueParams): CatalogueFilters {
  // A reversed range is a typo, not an empty catalogue — swap rather than
  // return nothing.
  const [minPrice, maxPrice] =
    params.min != null && params.max != null && params.min > params.max
      ? [params.max, params.min]
      : [params.min, params.max];

  return {
    productType: params.type,
    brands: params.brand,
    categories: params.category,
    ram: params.ram,
    storage: params.storage,
    minPrice,
    maxPrice,
    inStockOnly: params.stock,
    onOfferOnly: params.offer,
    query: params.q,
  };
}

/** How many filters are active — drives the mobile "Filters (3)" badge. */
export function countActiveFilters(params: CatalogueParams): number {
  return (
    params.brand.length +
    params.category.length +
    params.ram.length +
    params.storage.length +
    (params.type ? 1 : 0) +
    (params.min != null ? 1 : 0) +
    (params.max != null ? 1 : 0) +
    (params.stock ? 1 : 0) +
    (params.offer ? 1 : 0)
  );
}

/**
 * Build the query string for a changed filter.
 * Kept in one place so every control writes URLs the same way, and so changing
 * a filter always resets to page 1 — landing on page 7 of a 2-page result is a
 * classic way to show an empty catalogue to someone who just picked a brand.
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
