/**
 * The signal that the cart changed, for the header badge.
 *
 * The badge loads client-side (see getCartCountAction for why), so a
 * server-side revalidate does not reach it. A DOM event is the smallest thing
 * that connects "a line was added on the product page" to "the number in the
 * header", without a store, a context or a provider wrapping the whole app for
 * one integer.
 */
export const CART_CHANGED_EVENT = 'mps:cart-changed';

/** Safe to call during render or on the server; it simply does nothing there. */
export function announceCartChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CART_CHANGED_EVENT));
}
