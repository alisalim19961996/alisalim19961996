'use server';

import { revalidatePath } from 'next/cache';
import { claimCartForCurrentUser } from '@/server/services/cart';

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
