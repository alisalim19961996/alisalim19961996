import 'server-only';

import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from '@/server/db/client';
import { getCurrentUser } from '@/server/auth/guards';
import { clampQuantity, MAX_LINE_QUANTITY } from '@/lib/domain/cart';
import { isPurchasable } from '@/lib/domain/availability';
import type {
  AddToCartInput,
  RemoveCartItemInput,
  UpdateCartItemInput,
} from '@/schemas/cart';

/**
 * Cart service.
 *
 * Two rules shape everything here:
 *
 * 1. **The client never sends money.** Callers pass a variant id and a
 *    quantity. Prices are read from the variant row at render and again at
 *    checkout, so a tampered form changes what is bought, never what it costs.
 *
 * 2. **Reads never write cookies.** Next only allows `cookies().set` inside a
 *    Server Function or Route Handler — HTTP cannot set a cookie once the
 *    response has begun streaming. So the read path (`findCart`) returns null
 *    for a visitor with no cart rather than creating one, and only the write
 *    path (`resolveCartForWrite`) mints a token.
 */

/** Matches the `mps` prefix better-auth uses for its own cookies. */
const CART_COOKIE = 'mps.cart_token';

/** 30 days, the same window as a session. Long enough to come back tomorrow. */
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export class CartError extends Error {
  constructor(
    message: string,
    /** Key under the `cart` namespace in messages/, so the UI can translate it. */
    readonly code: 'variantNotFound' | 'notPurchasable' | 'insufficientStock',
  ) {
    super(message);
    this.name = 'CartError';
  }
}

function newCartToken(): string {
  // 32 bytes of CSPRNG entropy: the token is the only thing standing between an
  // anonymous visitor's cart and anyone who guesses it.
  return randomBytes(32).toString('base64url');
}

async function readCartToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

/**
 * Move an anonymous cart's lines into the signed-in user's cart.
 *
 * Called from the write path and from the cart read, both of which no-op when
 * there is nothing to merge. It exists as its own function because the sign-in
 * UI (Phase 4) should call it directly the moment a session is created — until
 * then, the first cart action after signing in performs the merge.
 *
 * Quantities are summed and re-clamped rather than replaced: someone who put
 * two cables in an anonymous cart and one more after signing in wants three.
 */
async function mergeAnonymousCart(userId: string, token: string): Promise<void> {
  const anonymous = await db.cart.findUnique({
    where: { token },
    select: {
      id: true,
      userId: true,
      items: { select: { variantId: true, quantity: true } },
    },
  });

  if (!anonymous || anonymous.userId || anonymous.items.length === 0) return;

  const userCart = await db.cart.upsert({
    where: { token: `user:${userId}` },
    create: { token: `user:${userId}`, userId },
    update: {},
    select: { id: true },
  });

  await db.$transaction([
    ...anonymous.items.map((item) =>
      db.cartItem.upsert({
        where: {
          cartId_variantId: { cartId: userCart.id, variantId: item.variantId },
        },
        create: {
          cartId: userCart.id,
          variantId: item.variantId,
          quantity: item.quantity,
        },
        update: { quantity: { increment: item.quantity } },
      }),
    ),
    db.cart.delete({ where: { id: anonymous.id } }),
  ]);

  // Summing can overshoot the per-line cap, so bring every merged line back
  // inside it in one statement rather than reading each row back.
  await db.cartItem.updateMany({
    where: { cartId: userCart.id, quantity: { gt: MAX_LINE_QUANTITY } },
    data: { quantity: MAX_LINE_QUANTITY },
  });
}

/**
 * The cart for this request, or null when the visitor has none.
 *
 * Safe to call while rendering: it never mints a token and never sets a
 * cookie. The one write it can perform is the merge above, which happens only
 * when a signed-in user still has an anonymous cart carrying items.
 */
export async function findCart(): Promise<{ id: string } | null> {
  const [user, token] = await Promise.all([getCurrentUser(), readCartToken()]);

  if (user) {
    if (token) await mergeAnonymousCart(user.id, token);
    return db.cart.findFirst({ where: { userId: user.id }, select: { id: true } });
  }

  if (!token) return null;
  return db.cart.findUnique({ where: { token }, select: { id: true } });
}

/**
 * The cart for this request, creating it — and its cookie — if needed.
 *
 * Only callable from a Server Action or Route Handler, because it may set a
 * cookie. Calling it during render throws, which is the correct failure: it
 * means a read path is trying to mutate.
 */
async function resolveCartForWrite(): Promise<{ id: string }> {
  const user = await getCurrentUser();
  const token = await readCartToken();

  if (user) {
    if (token) await mergeAnonymousCart(user.id, token);
    return db.cart.upsert({
      where: { token: `user:${user.id}` },
      create: { token: `user:${user.id}`, userId: user.id },
      update: {},
      select: { id: true },
    });
  }

  if (token) {
    const existing = await db.cart.findUnique({
      where: { token },
      select: { id: true },
    });
    if (existing) return existing;
  }

  const freshToken = newCartToken();
  const cart = await db.cart.create({
    data: { token: freshToken },
    select: { id: true },
  });

  const store = await cookies();
  store.set(CART_COOKIE, freshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: CART_COOKIE_MAX_AGE,
  });

  return cart;
}

/**
 * Read the variant and refuse anything that cannot actually be bought.
 *
 * Checking here as well as on the product page is the point: the page's
 * disabled button is a courtesy, and a Server Action can be invoked without
 * ever loading that page.
 */
async function assertPurchasable(variantId: string, quantity: number) {
  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      isActive: true,
      product: { select: { isPublished: true } },
      inventory: {
        select: {
          trackQuantity: true,
          status: true,
          onHand: true,
          reserved: true,
        },
      },
    },
  });

  if (!variant || !variant.isActive || !variant.product.isPublished) {
    throw new CartError(`variant ${variantId} is not for sale`, 'variantNotFound');
  }

  // A variant with no inventory row has never been stocked; treat that as
  // unavailable rather than assuming it can be sold.
  if (!variant.inventory) {
    throw new CartError(`variant ${variantId} has no inventory`, 'notPurchasable');
  }

  if (!isPurchasable(variant.inventory, quantity)) {
    throw new CartError(
      `variant ${variantId} cannot supply ${quantity}`,
      variant.inventory.trackQuantity ? 'insufficientStock' : 'notPurchasable',
    );
  }

  return variant;
}

/** Add to the cart, or raise the quantity of a line that already exists. */
export async function addToCart(input: AddToCartInput): Promise<void> {
  const quantity = clampQuantity(input.quantity);
  await assertPurchasable(input.variantId, quantity);

  const cart = await resolveCartForWrite();

  const existing = await db.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } },
    select: { quantity: true },
  });

  // Adding two to a line that already holds one means three — but the sum is
  // re-clamped, and re-checked against stock, so it can never exceed what is
  // actually available.
  const target = clampQuantity((existing?.quantity ?? 0) + quantity);
  if (existing) await assertPurchasable(input.variantId, target);

  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } },
    create: { cartId: cart.id, variantId: input.variantId, quantity: target },
    update: { quantity: target },
  });
}

/** Set a line to an exact quantity. */
export async function updateCartItem(input: UpdateCartItemInput): Promise<void> {
  const quantity = clampQuantity(input.quantity);
  await assertPurchasable(input.variantId, quantity);

  const cart = await resolveCartForWrite();

  // updateMany, not update: it is a no-op when the line is not in THIS cart,
  // where update would throw. A stale tab should not produce an error page.
  await db.cartItem.updateMany({
    where: { cartId: cart.id, variantId: input.variantId },
    data: { quantity },
  });
}

/** Remove a line entirely. */
export async function removeCartItem(input: RemoveCartItemInput): Promise<void> {
  const cart = await resolveCartForWrite();
  await db.cartItem.deleteMany({
    where: { cartId: cart.id, variantId: input.variantId },
  });
}

/** Empty the cart without deleting it, so the token stays valid. */
export async function clearCart(cartId: string): Promise<void> {
  await db.cartItem.deleteMany({ where: { cartId } });
}
