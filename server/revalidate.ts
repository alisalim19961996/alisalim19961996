import 'server-only';

import { revalidatePath } from 'next/cache';
import { locales } from '@/i18n/routing';

/**
 * Cache invalidation, in one place and in one convention.
 *
 * There were three conventions before this file, and two of them invalidated
 * nothing:
 *
 *  - `revalidatePath('/admin/orders', 'page')` — every route in MPS is
 *    locale-prefixed, so the real path is `/ar/admin/orders`. This matched no
 *    cache entry at all.
 *  - `revalidatePath('/[locale]/products/' + slug, 'page')` — half a route
 *    pattern and half a value. A pattern matches the route FILE; a literal
 *    matches one page. A mixture matches neither.
 *  - `revalidatePath('/', 'layout')` on every cart click — correct, and far
 *    wider than the change: it purges the client cache and every cached page
 *    in the shop because a line quantity went from 1 to 2.
 *
 * So everything here is a **literal path, once per locale**. Literal paths take
 * no `type` argument and need no guess about whether a route group belongs in
 * the pattern, which is the part of `revalidatePath`'s contract that is easy to
 * get subtly wrong and impossible to notice: a path that matches nothing does
 * not throw, it just leaves the old page on the shop floor.
 */

function everyLocale(path: string): void {
  for (const locale of locales) revalidatePath(`/${locale}${path}`);
}

/** One admin screen, in both locales. `path` starts with a slash. */
export function revalidateAdmin(...paths: readonly string[]): void {
  for (const path of paths) everyLocale(path);
}

/**
 * Everywhere a product can be seen without naming one: the homepage rails, the
 * catalogue, the offers page and the brand pages that count products.
 */
export function revalidateCatalogue(): void {
  everyLocale('');
  everyLocale('/products');
  everyLocale('/offers');
  everyLocale('/brands');
}

/**
 * One product's own page — and the page it used to live at.
 *
 * A slug change leaves the old URL cached and serving the product under its
 * previous name, which is exactly the case nobody tests because the new URL
 * looks right.
 */
export function revalidateProduct(slug: string, previousSlug?: string | null): void {
  everyLocale(`/products/${slug}`);
  if (previousSlug && previousSlug !== slug) everyLocale(`/products/${previousSlug}`);
}

/** The two pages that render cart contents. Both are dynamic; neither is the layout. */
export function revalidateCart(): void {
  everyLocale('/cart');
  everyLocale('/checkout');
}

/** The customer's own screens, after they change their own details. */
export function revalidateAccount(): void {
  everyLocale('/account');
  everyLocale('/account/orders');
}

/** The signed-in customer's saved products. */
export function revalidateWishlist(): void {
  everyLocale('/wishlist');
}

/** One buying guide, plus the index that lists it. */
export function revalidateGuides(
  slug?: string | null,
  previousSlug?: string | null,
): void {
  everyLocale('/guides');
  if (slug) everyLocale(`/guides/${slug}`);
  if (previousSlug && previousSlug !== slug) everyLocale(`/guides/${previousSlug}`);
}
