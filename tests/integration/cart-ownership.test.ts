import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

/**
 * Whose cart a token resolves to, against a real database.
 *
 * A signed-in customer's cart is keyed `user:<id>` in the same `token` column
 * a guest cart uses, and the guest branch used to look a token up by value
 * alone. So a visitor who set `mps.cart_token=user:<someone's id>` was handed
 * that account's cart — they could read it, add to it, and at checkout it would
 * have been consumed as theirs.
 *
 * `findCart()` reads the cookie through `next/headers`, so the cookie store is
 * what these tests drive. That is deliberate: the fix lives partly in how the
 * cookie is read (a `user:` value is not a guest token at all) and partly in
 * the query (`userId: null`), and only going through the real entry point
 * exercises both.
 */

const VIEWER = { id: '', name: 'Viewer', email: '', role: Role.CUSTOMER };
const COOKIE = { value: null as string | null };

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'mps.cart_token' && COOKIE.value
        ? { name, value: COOKIE.value }
        : undefined,
    set: () => {
      throw new Error('a read path must never set a cookie');
    },
    delete: () => {},
  }),
}));

vi.mock('@/server/auth/guards', () => ({
  getCurrentUser: async () => (VIEWER.id ? VIEWER : null),
  requireUser: async () => {
    if (!VIEWER.id) throw new Error('not signed in');
    return VIEWER;
  },
  requireStaff: async () => VIEWER,
  requireAdmin: async () => VIEWER,
}));

const { db } = await import('@/server/db/client');
const { findCart } = await import('@/server/services/cart');

const SUFFIX = Math.random().toString(36).slice(2, 8);
const made = { users: [] as string[], carts: [] as string[] };

/** Same shape the service mints: 32 CSPRNG bytes as base64url, 43 chars. */
function guestToken(seed: string): string {
  return (seed + 'x'.repeat(43)).slice(0, 43);
}

async function makeUser(label: string) {
  const user = await db.user.create({
    data: {
      email: `cart-${label}-${SUFFIX}@mps.local`,
      name: `Cart ${label}`,
      role: Role.CUSTOMER,
      emailVerified: false,
    },
    select: { id: true },
  });
  made.users.push(user.id);
  return user;
}

async function makeCart(token: string, userId: string | null) {
  const cart = await db.cart.create({
    data: { token, userId },
    select: { id: true },
  });
  made.carts.push(cart.id);
  return cart;
}

beforeAll(async () => {
  VIEWER.id = '';
});

afterAll(async () => {
  await db.cart.deleteMany({ where: { id: { in: made.carts } } });
  await db.user.deleteMany({ where: { id: { in: made.users } } });
  await db.$disconnect();
});

describe('a guest presenting a crafted token', () => {
  it('cannot reach an account cart by naming its `user:` token', async () => {
    const victim = await makeUser('victim');
    const theirCart = await makeCart(`user:${victim.id}`, victim.id);

    VIEWER.id = '';
    COOKIE.value = `user:${victim.id}`;

    const found = await findCart();
    expect(found).toBeNull();
    expect(found?.id).not.toBe(theirCart.id);
  });

  it('cannot reach an account cart even when the token is not namespaced', async () => {
    // The second half of the fix, independent of the cookie's shape: a cart
    // that belongs to somebody is never a guest cart, whatever its token says.
    const victim = await makeUser('victim2');
    const token = guestToken('owned');
    await makeCart(token, victim.id);

    VIEWER.id = '';
    COOKIE.value = token;

    expect(await findCart()).toBeNull();
  });

  it('gets nothing for a token no cart was ever minted with', async () => {
    VIEWER.id = '';
    COOKIE.value = guestToken('nobody');
    expect(await findCart()).toBeNull();
  });
});

describe('a legitimate guest', () => {
  it('finds their own cart', async () => {
    const token = guestToken('mine');
    const cart = await makeCart(token, null);

    VIEWER.id = '';
    COOKIE.value = token;

    expect((await findCart())?.id).toBe(cart.id);
  });
});

describe('a signed-in customer', () => {
  it('gets their own cart and not the one the cookie names', async () => {
    const [me, other] = await Promise.all([makeUser('me'), makeUser('other')]);
    const mine = await makeCart(`user:${me.id}`, me.id);
    const theirs = await makeCart(`user:${other.id}`, other.id);

    VIEWER.id = me.id;
    COOKIE.value = `user:${other.id}`;

    const found = await findCart();
    expect(found?.id).toBe(mine.id);
    expect(found?.id).not.toBe(theirs.id);
  });
});
