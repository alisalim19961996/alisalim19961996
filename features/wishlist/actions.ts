'use server';

import { revalidateWishlist } from '@/server/revalidate';
import { getCurrentUser } from '@/server/auth/guards';
import { getWishlistProductIds } from '@/server/queries/wishlist';
import {
  removeWishlistItem,
  toggleWishlistItem,
  WishlistError,
} from '@/server/services/wishlist';
import { wishlistItemSchema } from '@/schemas/wishlist';

/**
 * Wishlist Server Actions.
 *
 * A Server Action is a public endpoint — it can be invoked directly, with any
 * payload, by anyone who has the page. So the id is parsed here and the
 * service checks the session and the product again behind it. Nothing is
 * trusted because it came from a form this app rendered.
 *
 * Results are plain objects rather than thrown errors: these run from a small
 * button, and a failed save should leave the button saying so, not replace the
 * product page with an error screen.
 */

export interface WishlistToggleResult {
  ok: boolean;
  saved?: boolean;
  /** Key under the `wishlist` namespace in messages/, never a ready-made sentence. */
  errorKey?: string;
}

/**
 * Whether anybody is signed in, and what they have saved.
 *
 * The two answers travel together because the button needs both and they come
 * from one session read. Without `signedIn`, an empty list would be
 * indistinguishable from a signed-out visitor, and the button would offer to
 * save something into a list that does not exist.
 *
 * Read through an action rather than during render, because the homepage and
 * all 32 product pages are prerendered and a `cookies()` read inside them opts
 * every one into dynamic rendering (§8).
 */
export async function getMyWishlistAction(): Promise<{
  signedIn: boolean;
  ids: string[];
}> {
  const user = await getCurrentUser();
  if (!user) return { signedIn: false, ids: [] };

  return { signedIn: true, ids: await getWishlistProductIds() };
}

export async function toggleWishlistAction(input: {
  productId: string;
}): Promise<WishlistToggleResult> {
  const parsed = wishlistItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errorKey: 'actionFailed' };

  try {
    const { saved } = await toggleWishlistItem(parsed.data.productId);
    // The wishlist page renders server-side from the same rows, so a save made
    // from a product page has to invalidate it or the list shows yesterday.
    revalidateWishlist();
    return { ok: true, saved };
  } catch (error) {
    return failure(error);
  }
}

export async function removeFromWishlistAction(input: {
  productId: string;
}): Promise<WishlistToggleResult> {
  const parsed = wishlistItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errorKey: 'actionFailed' };

  try {
    await removeWishlistItem(parsed.data.productId);
    revalidateWishlist();
    return { ok: true, saved: false };
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown): WishlistToggleResult {
  if (error instanceof WishlistError) return { ok: false, errorKey: error.code };

  /*
    An unauthenticated call lands here, and it is not a bug: a session can
    expire between the page rendering and the heart being pressed. The button
    re-reads its state afterwards and discovers it needs to offer sign-in, so
    one honest message is enough. The detail goes to the server log.
  */
  console.error('[wishlist] action failed', error);
  return { ok: false, errorKey: 'actionFailed' };
}
