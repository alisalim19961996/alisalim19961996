import 'dotenv/config';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { DiscountType, Governorate, Role } from '@prisma/client';

/**
 * Discount codes, against a real database.
 *
 * The rules are pure and unit-tested. What needs Postgres is the part that
 * costs money: the counter. Two checkouts can both read `usageCount = 9`
 * against a limit of 10 and both pass, because both read before either wrote —
 * the same shape as the stock race, and the same fix. The last test here is
 * that race, run for real.
 */

const CUSTOMER = { id: '', name: 'Coupon Customer', role: Role.CUSTOMER };

vi.mock('@/server/auth/guards', () => ({
  getCurrentUser: async () => (CUSTOMER.id ? CUSTOMER : null),
  requireUser: async () => CUSTOMER,
  requireStaff: async () => ({ ...CUSTOMER, role: Role.ADMIN }),
  requireAdmin: async () => ({ ...CUSTOMER, role: Role.ADMIN }),
}));

const { db } = await import('@/server/db/client');
const { placeOrder, PlaceOrderError, quoteCoupon } =
  await import('@/server/services/order');

const codes: string[] = [];
const orderIds: string[] = [];

const CHECKOUT = {
  fullName: 'زبون الكوبون',
  phone: '+9647701234567',
  governorate: Governorate.BAGHDAD,
  city: 'الكرادة',
  addressLine: 'شارع الاختبار',
  notes: null,
  couponCode: null as string | null,
};

async function makeCoupon(overrides: Record<string, unknown> = {}) {
  const code = `TESTCOUPON${Date.now()}${codes.length}`;
  await db.coupon.create({
    data: {
      code,
      discountType: DiscountType.PERCENTAGE,
      discountValue: 10,
      minOrderIqd: 0,
      usageLimit: null,
      perUserLimit: 1,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 60 * 60_000),
      isActive: true,
      ...overrides,
    },
  });
  codes.push(code);
  return code;
}

/** A cart holding one purchasable variant, so an order can actually be placed. */
async function makeCart(quantity = 1) {
  const variant = await db.productVariant.findFirstOrThrow({
    where: {
      isActive: true,
      product: { isPublished: true },
      inventory: { status: 'IN_STOCK' },
    },
    select: { id: true, priceIqd: true },
  });

  const cart = await db.cart.create({
    data: {
      token: `coupon-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      items: { create: { variantId: variant.id, quantity } },
    },
    select: { id: true },
  });

  return { cartId: cart.id, subtotalIqd: variant.priceIqd * quantity };
}

afterAll(async () => {
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.coupon.deleteMany({ where: { code: { in: codes } } });
  await db.cart.deleteMany({ where: { token: { startsWith: 'coupon-test-' } } });
  await db.$disconnect();
});

describe('quoting a code', () => {
  it('values a live one against the cart', async () => {
    const code = await makeCoupon();
    const quote = await quoteCoupon(code, 100_000);
    expect(quote).toEqual({ ok: true, code, discountIqd: 10_000 });
  });

  it('answers the same for an unknown code and a switched-off one', async () => {
    const off = await makeCoupon({ isActive: false });
    expect(await quoteCoupon('NO-SUCH-CODE-AT-ALL', 100_000)).toEqual({
      ok: false,
      reason: 'couponInvalid',
    });
    expect(await quoteCoupon(off, 100_000)).toEqual({
      ok: false,
      reason: 'couponInvalid',
    });
  });

  it('does not consume a use', async () => {
    // Refreshing the checkout page must not burn a single-use code.
    const code = await makeCoupon({ usageLimit: 1 });
    await quoteCoupon(code, 100_000);
    await quoteCoupon(code, 100_000);

    const coupon = await db.coupon.findUniqueOrThrow({
      where: { code },
      select: { usageCount: true },
    });
    expect(coupon.usageCount).toBe(0);
  });
});

describe('placing an order with a code', () => {
  it('discounts the order and records the use', async () => {
    const code = await makeCoupon();
    const { cartId, subtotalIqd } = await makeCart();

    const placed = await placeOrder(cartId, { ...CHECKOUT, couponCode: code });

    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: placed.orderNumber },
      select: {
        id: true,
        subtotalIqd: true,
        discountIqd: true,
        deliveryIqd: true,
        totalIqd: true,
      },
    });
    orderIds.push(order.id);

    const expected = Math.floor(subtotalIqd / 10);
    expect(order.discountIqd).toBe(expected);
    // The CHECK constraint says this must hold; asserting it here says the
    // service computed it rather than the database merely tolerating it.
    expect(order.totalIqd).toBe(
      order.subtotalIqd - order.discountIqd + order.deliveryIqd,
    );

    const usage = await db.couponUsage.findUniqueOrThrow({
      where: { orderId: order.id },
      select: { discountIqd: true },
    });
    expect(usage.discountIqd).toBe(expected);

    const coupon = await db.coupon.findUniqueOrThrow({
      where: { code },
      select: { usageCount: true },
    });
    expect(coupon.usageCount).toBe(1);
  });

  it('refuses the whole order on a bad code rather than charging full price', async () => {
    // Dropping the code and placing the order anyway is the worse outcome: the
    // customer pressed the button expecting a discount, and would find out
    // when the courier asked for more money.
    const { cartId } = await makeCart();

    await expect(
      placeOrder(cartId, { ...CHECKOUT, couponCode: 'NOT-A-REAL-CODE' }),
    ).rejects.toBeInstanceOf(PlaceOrderError);

    // And nothing was written: no order, and the cart still has its line.
    const items = await db.cartItem.count({ where: { cartId } });
    expect(items).toBe(1);
  });

  it('refuses an order below the coupon’s minimum', async () => {
    const { cartId, subtotalIqd } = await makeCart();
    const code = await makeCoupon({ minOrderIqd: subtotalIqd + 1 });

    await expect(
      placeOrder(cartId, { ...CHECKOUT, couponCode: code }),
    ).rejects.toMatchObject({ failure: { reason: 'couponMinOrder' } });
  });
});

describe('two checkouts at the same moment', () => {
  it('both get an order, with different numbers', async () => {
    /*
      This is the test that found a real bug, and it is worth keeping for that
      reason alone.

      Order numbers are `MPS-<YY><DDD>-<NNNN>`, allocated by counting the day's
      orders. Two simultaneous checkouts both counted the same total, both
      built the same number, and the second `INSERT` violated the unique index
      — at which point Postgres ABORTED the transaction (25P02), so the
      retry-on-collision loop that was supposed to handle it ran against a dead
      transaction and threw something unrelated. The customer met "something
      went wrong" on a checkout that should have been numbered one higher.

      `pg_advisory_xact_lock` removed the race rather than reacting to it.
    */
    const [first, second] = await Promise.all([makeCart(), makeCart()]);

    const results = await Promise.all([
      placeOrder(first.cartId, { ...CHECKOUT }),
      placeOrder(second.cartId, { ...CHECKOUT }),
    ]);

    const numbers = results.map((result) => result.orderNumber);
    expect(new Set(numbers).size).toBe(2);

    for (const orderNumber of numbers) {
      const order = await db.order.findUniqueOrThrow({
        where: { orderNumber },
        select: { id: true },
      });
      orderIds.push(order.id);
    }
  });

  it('lets exactly one of them take the last use of a code', async () => {
    /*
      One code with one use left, two checkouts at once, one order.

      What this test actually proves is the OUTCOME — one use of a one-use code
      — not which mechanism delivered it. Replacing the conditional UPDATE with
      a read-then-write still passes, because the advisory lock that numbers
      the order serialises the whole checkout for the day. That is worth
      writing down rather than implying a proof this does not give: the UPDATE
      is kept so the invariant survives that lock being moved.
    */
    const code = await makeCoupon({ usageLimit: 1 });
    const [first, second] = await Promise.all([makeCart(), makeCart()]);

    const results = await Promise.allSettled([
      placeOrder(first.cartId, { ...CHECKOUT, couponCode: code }),
      placeOrder(second.cartId, { ...CHECKOUT, couponCode: code }),
    ]);

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const order = await db.order.findUniqueOrThrow({
        where: { orderNumber: result.value.orderNumber },
        select: { id: true },
      });
      orderIds.push(order.id);
    }

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);

    const coupon = await db.coupon.findUniqueOrThrow({
      where: { code },
      select: { usageCount: true },
    });
    expect(coupon.usageCount).toBe(1);
    expect(await db.couponUsage.count({ where: { coupon: { code } } })).toBe(1);
  });
});

describe('numbering after a deletion', () => {
  it('does not reissue a number an existing order still holds', async () => {
    /*
      The second bug this file found, and the one that made the first
      confusing. The allocator used to take `count(today's orders) + 1`. Delete
      an order from the MIDDLE of a day and the count drops while the numbers
      above it stay, so the next order is handed one that another order already
      holds — the insert fails and the customer sees "something went wrong".

      Not hypothetical: it happened here, because these suites tidy up after
      themselves. Reading the highest number issued today fixes it. Deleting
      the highest order does still free its number, and that is fine — nothing
      holds it any more.
    */
    const carts = await Promise.all([makeCart(), makeCart(), makeCart(), makeCart()]);

    const placed = [];
    for (const cart of carts.slice(0, 3)) {
      placed.push(await placeOrder(cart.cartId, { ...CHECKOUT }));
    }

    const middle = await db.order.findUniqueOrThrow({
      where: { orderNumber: placed[1]!.orderNumber },
      select: { id: true },
    });
    await db.order.delete({ where: { id: middle.id } });

    // The gap is open, and the number above it is still in use.
    const next = await placeOrder(carts[3]!.cartId, { ...CHECKOUT });

    expect(next.orderNumber).not.toBe(placed[0]!.orderNumber);
    expect(next.orderNumber).not.toBe(placed[2]!.orderNumber);

    for (const orderNumber of [
      placed[0]!.orderNumber,
      placed[2]!.orderNumber,
      next.orderNumber,
    ]) {
      const order = await db.order.findUniqueOrThrow({
        where: { orderNumber },
        select: { id: true },
      });
      orderIds.push(order.id);
    }
  });
});
