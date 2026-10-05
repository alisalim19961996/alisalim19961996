/**
 * The store's own name, in the language being read.
 *
 * Its own function because two places on one page need the same answer: the
 * `<title>` that `generateMetadata` builds and the heading the page renders.
 * They were computed separately, and the metadata forgot to pass it at all —
 * `"عن {store}"` reached the browser as a formatting error. Two copies of
 * "which column, and what if it is empty" is how a page ends up titled after
 * one name and headed with another (§13.16).
 *
 * The fallback is the product's own name, not a commercial claim: the
 * `SiteSetting` row genuinely starts empty, and a page titled "عن " is worse
 * than one titled after the software until the owner types theirs.
 *
 * Takes plain values and a plain locale string, so it stays pure and testable
 * without reaching for the request's locale or a database client.
 */
export const FALLBACK_STORE_NAME = 'MPS';

export function storeDisplayName(
  settings: { storeNameAr: string | null; storeNameEn: string | null } | null,
  locale: string,
): string {
  const chosen = locale === 'ar' ? settings?.storeNameAr : settings?.storeNameEn;
  return chosen?.trim() || FALLBACK_STORE_NAME;
}
