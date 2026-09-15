import { z } from 'zod';

/**
 * What a client is allowed to say about a wishlist.
 *
 * A product id and nothing else. Which account the list belongs to is read
 * from the session inside the service — a `userId` here would be a parameter
 * that decides whose list is edited, arriving from the browser.
 */

/** cuid() ids: a fixed alphabet, so a malformed id is rejected before any query. */
const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/i, 'invalid id');

export const wishlistItemSchema = z.object({ productId: id });

export type WishlistItemInput = z.infer<typeof wishlistItemSchema>;
