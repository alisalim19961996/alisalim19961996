import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Governorate, OrderStatus, Role } from '@prisma/client';

/**
 * Who may read an order, against a real database.
 *
 * This is the only screen on the storefront that answers with a customer's
 * name, phone number and home address, and until this suite existed the answer
 * was `cookieValue === orderNumber`. `httpOnly` stops JavaScript READING a
 * cookie; it does not stop a client SETTING one — and order numbers are
 * sequential by design (§12), because they have to be readable aloud to a
 * courier. So anybody could type `mps.recent_order=MPS-26091-0042` into their
 * own browser and walk a day's four digits.
 *
 * Every test here is a negative except the two that prove the real customer
 * still gets in, and each one was checked against the old behaviour: with the
 * order number in the cookie, "a made-up value" and "the number itself" both
 * returned the whole order.
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
const { findOwnedOrder, identifyOrderByNumberAndPhone } =
  await import('@/server/queries/order');
const { issueOrderGrant } = await import('@/server/services/order');
const { createOrderGrant, hashOrderGrant } = await import('@/lib/domain/order-grant');

const SUFFIX = Math.random().toString(36).slice(2, 8);
const made = { users: [] as string[], orders: [] as string[] };

const BUYER_PHONE = '+9647701234567';

async function makeUser(label: string) {
  const user = await db.user.create({
    data: {
      email: `access-${label}-${SUFFIX}@mps.local`,
      name: `Access ${label}`,
      role: Role.CUSTOMER,
      emailVerified: false,
    },
    select: { id: true },
  });
  made.users.push(user.id);
  return user;
}

let sequence = 0;

/** An order row written directly: this suite is about reading, not placing. */
async function makeOrder(options: { userId?: string; phone?: string } = {}) {
  sequence += 1;
  const order = await db.order.create({
    data: {
      orderNumber: `MPS-ACC${SUFFIX}-${String(sequence).padStart(4, '0')}`,
      userId: options.userId ?? null,
      status: OrderStatus.PENDING,
      fullName: 'زبون الاختبار',
      phone: options.phone ?? BUYER_PHONE,
      governorate: Governorate.BAGHDAD,
      city: 'الكرادة',
      addressLine: 'شارع ٦٢، بناية ١٤',
      subtotalIqd: 100_000,
      deliveryIqd: 5_000,
      totalIqd: 105_000,
    },
    select: { id: true, orderNumber: true },
  });
  made.orders.push(order.id);
  return order;
}

beforeAll(async () => {
  const viewer = await makeUser('viewer');
  VIEWER.id = viewer.id;
});

afterAll(async () => {
  await db.order.deleteMany({ where: { id: { in: made.orders } } });
  await db.user.deleteMany({ where: { id: { in: made.users } } });
  await db.$disconnect();
});

describe('a guest with a grant', () => {
  it('sees the order the grant was issued for', async () => {
    VIEWER.id = '';
    const order = await makeOrder();
    const grant = await issueOrderGrant(order.id);

    const view = await findOwnedOrder(order.orderNumber, { userId: null, grant }, 'ar');

    expect(view?.orderNumber).toBe(order.orderNumber);
    expect(view?.phone).toBe(BUYER_PHONE);
  });

  it('does not see a DIFFERENT order with the same grant', async () => {
    VIEWER.id = '';
    const mine = await makeOrder();
    const theirs = await makeOrder();
    const grant = await issueOrderGrant(mine.id);

    const view = await findOwnedOrder(
      theirs.orderNumber,
      { userId: null, grant },
      'ar',
    );

    expect(view).toBeNull();
  });
});

describe('a guest without one', () => {
  it('is refused a grant that was never issued', async () => {
    VIEWER.id = '';
    const order = await makeOrder();
    await issueOrderGrant(order.id);

    const view = await findOwnedOrder(
      order.orderNumber,
      { userId: null, grant: createOrderGrant() },
      'ar',
    );

    expect(view).toBeNull();
  });

  it('is refused the ORDER NUMBER as a cookie value', async () => {
    // The exact attack. Under the old code this returned the whole order.
    VIEWER.id = '';
    const order = await makeOrder();
    await issueOrderGrant(order.id);

    const view = await findOwnedOrder(
      order.orderNumber,
      { userId: null, grant: order.orderNumber },
      'ar',
    );

    expect(view).toBeNull();
  });

  it('is refused the STORED HASH, which is not the key', async () => {
    // If the column held the raw grant, a leaked backup would be a set of
    // working cookies. Presenting the hash must not work.
    VIEWER.id = '';
    const order = await makeOrder();
    const grant = await issueOrderGrant(order.id);

    const view = await findOwnedOrder(
      order.orderNumber,
      { userId: null, grant: hashOrderGrant(grant) },
      'ar',
    );

    expect(view).toBeNull();
  });

  it('is refused an expired grant', async () => {
    VIEWER.id = '';
    const order = await makeOrder();
    const grant = await issueOrderGrant(order.id);

    await db.order.update({
      where: { id: order.id },
      data: { guestAccessExpiresAt: new Date(Date.now() - 1000) },
    });

    expect(
      await findOwnedOrder(order.orderNumber, { userId: null, grant }, 'ar'),
    ).toBeNull();
  });

  it('is refused the moment the grant is revoked', async () => {
    VIEWER.id = '';
    const order = await makeOrder();
    const grant = await issueOrderGrant(order.id);

    expect(
      await findOwnedOrder(order.orderNumber, { userId: null, grant }, 'ar'),
    ).not.toBeNull();

    // Clearing the column IS the revocation: nothing else has to change.
    await db.order.update({
      where: { id: order.id },
      data: { guestAccessHash: null },
    });

    expect(
      await findOwnedOrder(order.orderNumber, { userId: null, grant }, 'ar'),
    ).toBeNull();
  });

  it('is refused with no cookie at all', async () => {
    VIEWER.id = '';
    const order = await makeOrder();

    expect(
      await findOwnedOrder(order.orderNumber, { userId: null, grant: null }, 'ar'),
    ).toBeNull();
  });
});

describe('a signed-in customer', () => {
  it('sees their own order without any grant', async () => {
    const owner = await makeUser('owner');
    VIEWER.id = owner.id;
    const order = await makeOrder({ userId: owner.id });

    const view = await findOwnedOrder(
      order.orderNumber,
      { userId: owner.id, grant: null },
      'ar',
    );

    expect(view?.orderNumber).toBe(order.orderNumber);
  });

  it('does not see somebody else’s', async () => {
    const [owner, stranger] = await Promise.all([
      makeUser('owner2'),
      makeUser('stranger'),
    ]);
    const order = await makeOrder({ userId: owner.id });

    VIEWER.id = stranger.id;
    expect(
      await findOwnedOrder(
        order.orderNumber,
        { userId: stranger.id, grant: null },
        'ar',
      ),
    ).toBeNull();
  });

  it('does not see a guest order that merely shares their phone number', async () => {
    // A phone number is not verified anywhere in MPS, so it is not identity.
    const owner = await makeUser('phone-twin');
    const guestOrder = await makeOrder({ phone: BUYER_PHONE });

    VIEWER.id = owner.id;
    expect(
      await findOwnedOrder(
        guestOrder.orderNumber,
        { userId: owner.id, grant: null },
        'ar',
      ),
    ).toBeNull();
  });
});

describe('the tracking form', () => {
  it('identifies an order from its number and the phone that placed it', async () => {
    const order = await makeOrder();
    const found = await identifyOrderByNumberAndPhone(order.orderNumber, '07701234567');
    expect(found?.id).toBe(order.id);
  });

  it('answers the same for a wrong phone as for a number that does not exist', async () => {
    const order = await makeOrder();
    const wrongPhone = await identifyOrderByNumberAndPhone(
      order.orderNumber,
      '07809999999',
    );
    const noSuchOrder = await identifyOrderByNumberAndPhone(
      'MPS-00000-0000',
      '07701234567',
    );
    expect(wrongPhone).toBeNull();
    expect(noSuchOrder).toBeNull();
    expect(wrongPhone).toEqual(noSuchOrder);
  });

  it('issues a grant that then opens the page, and replaces the previous one', async () => {
    VIEWER.id = '';
    const order = await makeOrder();
    const first = await issueOrderGrant(order.id);
    const second = await issueOrderGrant(order.id);

    expect(second).not.toBe(first);
    expect(
      await findOwnedOrder(order.orderNumber, { userId: null, grant: second }, 'ar'),
    ).not.toBeNull();
    // The older browser loses access: one grant per order, the newest wins.
    expect(
      await findOwnedOrder(order.orderNumber, { userId: null, grant: first }, 'ar'),
    ).toBeNull();
  });
});
