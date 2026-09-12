import { z } from 'zod';
import { MAX_LINE_QUANTITY } from '@/lib/domain/cart';

/**
 * What a client is allowed to say about the cart.
 *
 * The entire surface is an id and a count. No price, no line total, no
 * currency — those are read from the database and computed on the server every
 * single time. A client that sends money is not trusted, it is ignored, which
 * is why there is nowhere in these schemas to put it.
 */

/** cuid() ids: a fixed alphabet, so a malformed id is rejected before any query. */
const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/i, 'invalid id');

const quantity = z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY);

export const addToCartSchema = z.object({
  variantId: id,
  quantity: quantity.default(1),
});

export const updateCartItemSchema = z.object({
  variantId: id,
  quantity,
});

export const removeCartItemSchema = z.object({
  variantId: id,
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type RemoveCartItemInput = z.infer<typeof removeCartItemSchema>;
