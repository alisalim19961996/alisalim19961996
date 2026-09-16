'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { claimCartForCurrentUser } from '@/server/services/cart';
import { ORDER_GRANT_COOKIE } from '@/server/services/order';

/**
 * Auth Server Actions.
 *
 * Sign-in and sign-out themselves are NOT here: they go over HTTP through
 * better-auth's handler so its rate limits actually apply (see
 * server/auth/auth.ts). What is here is the work that has to happen around a
 * session change and cannot happen in the browser.
 */

/**
 * Fold the visitor's anonymous cart into the account they just signed in to.
 *
 * Called by the sign-in form the moment a session exists. The cart service
 * would do this lazily on the next cart action anyway, but "lazily" means a
 * customer who signs in on the cart page sees an empty cart until they touch
 * something — which reads as having lost it.
 */
export async function claimCartAfterSignInAction(): Promise<void> {
  await claimCartForCurrentUser();
  // The header's count is client-side, but the cart page and checkout are
  // rendered on the server and must not show the pre-merge cart.
  revalidatePath('/', 'layout');
}

/**
 * Forget that this browser placed an order, on the way out.
 *
 * `mps.recent_order` is one of the three things that opens an order page
 * (§12), and it means "this browser ordered it" — not "this account did". It
 * outlives a sign-out, so on a shared machine the next person to use the
 * browser could open the previous customer's order and read their name, phone
 * number and delivery address. Found by signing out and back in as somebody
 * else while checking the account pages.
 *
 * Signing out is the one unambiguous "I have finished on this computer", so
 * that is where it is dropped. The order itself is not lost to its owner: it
 * is in their account, which is the whole point of having one.
 */
export async function forgetRecentOrderAction(): Promise<void> {
  const store = await cookies();
  store.delete(ORDER_GRANT_COOKIE);
}
