import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Governorate, OrderStatus, Role } from '@prisma/client';

/**
 * A customer's order history, against a real database.
 *
 * The one thing worth proving here is a negative: that `getMyOrders()` shows
 * NOTHING belonging to anybody else. It is the query behind a page whose
 * rows carry names, phone numbers and delivery addresses, and the failure
 * mode is silent — a wrong `where` returns a longer list, not an error.
 *
 * Guest orders sharing a phone number are the interesting case. Folding them
 * in sounds helpful, and would mean anyone who registers with somebody else's
 * number reads their order history: a phone number is not verified anywhere
 * in MPS.
 */

const VIEWER = { id: '', name: 'Viewer', email: '', role: Role.CUSTOMER };

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
const { getMyOrders } = await import('@/server/queries/order');

const SUFFIX = Math.random().toString(36).slice(2, 8);
const PHONE = '+9647701234567';
const made = { users: [] as string[], orders: [] as string[] };

async function makeUser(label: string) {
  const user = await db.user.create({
    data: {
      email: `acct-${label}-${SUFFIX}@mps.local`,
      name: `Account ${label}`,
      role: Role.CUSTOMER,
      emailVerified: false,
    },
    select: { id: true, email: true },
  });
  made.users.push(user.id);
  return user;
}

/**
 * An order row written directly.
 *
 * `placeOrder` is exercised thoroughly in `order.test.ts`; going through it
 * here would need a cart, a variant and stock per case and would test the
 * checkout path all over again rather than the read.
 */
async function makeOrder(label: string, userId: string | null, placedAt = new Date()) {
  const order = await db.order.create({
    data: {
      orderNumber: `MPS-ACCT${SUFFIX.toUpperCase()}-${label}`,
      userId,
      fullName: 'Account Integration',
      phone: PHONE,
      governorate: Governorate.BAGHDAD,
      city: 'Baghdad',
      addressLine: 'Somewhere',
      status: OrderStatus.PENDING,
      subtotalIqd: 100_000,
      discountIqd: 0,
      deliveryIqd: 5_000,
      totalIqd: 105_000,
      placedAt,
    },
    select: { id: true, orderNumber: true },
  });
  made.orders.push(order.id);
  return order;
}

beforeAll(async () => {
  const viewer = await makeUser('viewer');
  VIEWER.id = viewer.id;
  VIEWER.email = viewer.email;
});

afterAll(async () => {
  await db.order.deleteMany({ where: { id: { in: made.orders } } });
  await db.user.deleteMany({ where: { id: { in: made.users } } });
  await db.$disconnect();
});

describe('getMyOrders', () => {
  it('returns nothing before anything is ordered', async () => {
    const result = await getMyOrders();
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.pageCount).toBe(1);
  });

  it('returns the viewer’s own orders, newest first', async () => {
    await makeOrder('OLD', VIEWER.id, new Date('2026-01-01T10:00:00Z'));
    await makeOrder('NEW', VIEWER.id, new Date('2026-06-01T10:00:00Z'));

    const result = await getMyOrders();
    expect(result.rows.map((row) => row.orderNumber)).toEqual([
      `MPS-ACCT${SUFFIX.toUpperCase()}-NEW`,
      `MPS-ACCT${SUFFIX.toUpperCase()}-OLD`,
    ]);
    expect(result.total).toBe(2);
  });

  it('never shows another account’s order', async () => {
    const stranger = await makeUser('stranger');
    await makeOrder('THEIRS', stranger.id);

    const result = await getMyOrders();
    expect(result.total).toBe(2);
    expect(result.rows.map((row) => row.orderNumber)).not.toContain(
      `MPS-ACCT${SUFFIX.toUpperCase()}-THEIRS`,
    );
  });

  it('never shows a guest order that merely shares the phone number', async () => {
    // Same PHONE as every other fixture, and no userId. Matching on phone
    // would hand this to anyone who registers with that number.
    await makeOrder('GUEST', null);

    const result = await getMyOrders();
    expect(result.total).toBe(2);
    expect(result.rows.map((row) => row.orderNumber)).not.toContain(
      `MPS-ACCT${SUFFIX.toUpperCase()}-GUEST`,
    );
  });

  it('refuses to run at all when nobody is signed in', async () => {
    const signedIn = VIEWER.id;
    VIEWER.id = '';
    // The guard is inside the query, not only on the page above it: this is
    // what makes the data safe if it is ever called from somewhere else.
    await expect(getMyOrders()).rejects.toThrow();
    VIEWER.id = signedIn;
  });

  it('pages without losing or repeating a row', async () => {
    for (let i = 0; i < 11; i++) {
      await makeOrder(`P${i}`, VIEWER.id, new Date(2026, 0, i + 1));
    }

    const first = await getMyOrders(1);
    const second = await getMyOrders(2);

    expect(first.total).toBe(13);
    expect(first.pageCount).toBe(2);
    expect(first.rows).toHaveLength(10);
    expect(second.rows).toHaveLength(3);

    const seen = [...first.rows, ...second.rows].map((row) => row.orderNumber);
    expect(new Set(seen).size).toBe(13);
  });
});
