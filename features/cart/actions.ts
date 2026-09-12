'use server';

import { revalidatePath } from 'next/cache';
import {
  addToCart,
  CartError,
  findCart,
  removeCartItem,
  updateCartItem,
} from '@/server/services/cart';
import { getCartItemCount } from '@/server/queries/cart';
import {
  addToCartSchema,
  removeCartItemSchema,
  updateCartItemSchema,
} from '@/schemas/cart';

/**
 * Cart Server Actions.
 *
 * A Server Action is a public endpoint. It can be invoked directly, with any
 * payload, by anyone who has the page — so every input is parsed by Zod here
 * and re-validated against the database in the service. Nothing is trusted
 * because it came from a form this app rendered.
 *
 * The result is a plain object rather than a thrown error: these run from
 * buttons, and a failed add-to-cart should re-render the button with a message,
 * not replace the product page with an error screen.
 */

export interface CartActionResult {
  ok: boolean;
  /** Key under the `cart` namespace in messages/, never a ready-made sentence. */
  errorKey?: string;
}

const GENERIC_ERROR: CartActionResult = { ok: false, errorKey: 'actionFailed' };

async function run(operation: () => Promise<void>): Promise<CartActionResult> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof CartError) return { ok: false, errorKey: error.code };
    // Anything else is a bug or an outage. The customer gets one honest
    // message; the detail goes to the server log, not into the response.
    console.error('[cart] action failed', error);
    return GENERIC_ERROR;
  }

  // The header's item count is rendered on every page, so every cart change
  // has to invalidate the whole tree rather than just the cart route.
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function addToCartAction(input: {
  variantId: string;
  quantity?: number;
}): Promise<CartActionResult> {
  const parsed = addToCartSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errorKey: 'invalidRequest' };
  return run(() => addToCart(parsed.data));
}

export async function updateCartItemAction(input: {
  variantId: string;
  quantity: number;
}): Promise<CartActionResult> {
  const parsed = updateCartItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errorKey: 'invalidQuantity' };
  return run(() => updateCartItem(parsed.data));
}

export async function removeCartItemAction(input: {
  variantId: string;
}): Promise<CartActionResult> {
  const parsed = removeCartItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errorKey: 'invalidRequest' };
  return run(() => removeCartItem(parsed.data));
}

/**
 * The header's item count.
 *
 * Fetched by the client after hydration rather than rendered on the server,
 * and the reason is structural: the header is in the root layout, so a
 * `cookies()` read inside it opts EVERY route into dynamic rendering. That
 * turned the homepage and all 32 product pages from prerendered HTML into
 * per-request renders — a real cost, paid on every visit, to show a number
 * that is decoration until the cart has something in it.
 *
 * So the count is the one piece of the header that arrives a beat late. The
 * cart page itself still reads the cart on the server, where it is the point
 * of the page rather than a passenger on every other one.
 */
export async function getCartCountAction(): Promise<number> {
  const cart = await findCart();
  return getCartItemCount(cart?.id ?? null);
}
