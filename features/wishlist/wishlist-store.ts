import { getMyWishlistAction } from './actions';

/**
 * One answer to "what has this customer saved", shared by every heart on the
 * page.
 *
 * A catalogue page renders 24 cards. If each heart asked the server for itself
 * that would be 24 round trips for one row of the database, so the promise is
 * cached here at module scope: the first button to ask starts the request and
 * every other button awaits the same one.
 *
 * Module scope rather than a React context, for the reason `cart-events.ts`
 * gives: a provider wrapping the whole app to carry a set of ids is more
 * machinery than the problem needs, and it would have to be mounted on pages
 * that render no hearts at all.
 *
 * Nothing here is authorization. The set decides which icon is drawn; the
 * service decides whose list is edited, from the session, every time.
 */

export interface WishlistSnapshot {
  signedIn: boolean;
  ids: ReadonlySet<string>;
}

/** The signal that the list changed, so every heart on the page re-reads it. */
export const WISHLIST_CHANGED_EVENT = 'mps:wishlist-changed';

const EMPTY: WishlistSnapshot = { signedIn: false, ids: new Set() };

let pending: Promise<WishlistSnapshot> | null = null;

export function loadWishlist(): Promise<WishlistSnapshot> {
  pending ??= getMyWishlistAction()
    .then((result) => ({ signedIn: result.signedIn, ids: new Set(result.ids) }))
    .catch((error: unknown) => {
      // A failed read must not poison the cache: the next button to ask should
      // get a fresh attempt rather than the same rejection for the life of the
      // page. The heart falls back to "not saved", which is wrong at worst for
      // one render and corrects itself on the next event.
      console.error('[wishlist] could not read the saved list', error);
      pending = null;
      return EMPTY;
    });

  return pending;
}

/**
 * Drop the cache and tell every heart to re-read.
 *
 * Called after a toggle. The alternative — each button updating only itself —
 * leaves the same product's heart on a second card (a rail and the grid can
 * both show it) contradicting the one that was pressed.
 */
export function announceWishlistChanged(): void {
  pending = null;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(WISHLIST_CHANGED_EVENT));
}
