import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Governorate, OrderStatus, PaymentStatus, StockStatus } from '@prisma/client';

// placeOrder reads the session to stamp userId on the order. Sessions come from
// request headers, which do not exist in a test runner, so the guard is stubbed
// to "signed out" — the guest path, and the one most MPS orders take.
vi.mock('@/server/auth/guards', () => ({
  getCurrentUser: async () => null,
}));

const { db } = await import('@/server/db/client');
const { placeOrder, PlaceOrderError } = await import('@/server/services/order');

/**
 * Order placement against a real database.
 *
 * What is being tested here cannot be tested with a fake: a transaction that
 * must roll back completely, a conditional UPDATE that two checkouts race for,
 * and CHECK constraints that Postgres — not TypeScript — enforces.
 */

const ADDRESS = {
  fullName: 'Integration Test',
  phone: '+9647700000000',
  governorate: Governorate.BAGHDAD,
  city: 'Karrada',
  addressLine: 'Street 62, house 14',
  notes: null,
};

/** A product nobody else's test or seed will touch. */
async function createFixture(options: {
  priceIqd: number;
  trackQuantity: boolean;
  onHand?: number;
}) {
  const suffix = Math.random().toString(36).slice(2, 10);

  const [productType, brand, category] = await Promise.all([
    db.productType.findFirstOrThrow({ select: { id: true } }),
    db.brand.findFirstOrThrow({ select: { id: true, nameEn: true } }),
    db.category.findFirstOrThrow({ select: { id: true } }),
  ]);

  const product = await db.product.create({
    data: {
      slugAr: `itest-${suffix}`,
      slugEn: `itest-${suffix}`,
      nameAr: `منتج اختبار ${suffix}`,
      nameEn: `Test product ${suffix}`,
      productTypeId: productType.id,
      brandId: brand.id,
      categoryId: category.id,
      isPublished: true,
      minPriceIqd: options.priceIqd,
      variants: {
        create: {
          sku: `ITEST-${suffix}`,
          labelAr: 'اختبار',
          labelEn: 'Test',
          priceIqd: options.priceIqd,
          isActive: true,
          inventory: {
            create: {
              status: StockStatus.IN_STOCK,
              trackQuantity: options.trackQuantity,
              onHand: options.onHand ?? 0,
              reserved: 0,
            },
          },
        },
      },
    },
    select: { id: true, variants: { select: { id: true } } },
  });

  const variantId = product.variants[0]!.id;
  return { productId: product.id, variantId };
}

async function createCartWith(variantId: string, quantity: number) {
  const cart = await db.cart.create({
    data: {
      token: `itest-${Math.random().toString(36).slice(2)}`,
      items: { create: { variantId, quantity } },
    },
    select: { id: true },
  });
  return cart.id;
}

const createdProductIds: string[] = [];

async function fixture(options: Parameters<typeof createFixture>[0]) {
  const result = await createFixture(options);
  createdProductIds.push(result.productId);
  return result;
}

afterAll(async () => {
  // Orders reference variants with onDelete: SetNull, so products can go.
  await db.order.deleteMany({ where: { fullName: ADDRESS.fullName } });
  await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await db.$disconnect();
});

beforeEach(async () => {
  await db.order.deleteMany({ where: { fullName: ADDRESS.fullName } });
});

describe('placeOrder', () => {
  it('writes the order, its snapshot, its payment and its first event', async () => {
    const { variantId } = await fixture({ priceIqd: 385_000, trackQuantity: false });
    const cartId = await createCartWith(variantId, 2);

    const placed = await placeOrder(cartId, ADDRESS);

    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: placed.orderNumber },
      select: {
        status: true,
        phone: true,
        subtotalIqd: true,
        deliveryIqd: true,
        discountIqd: true,
        totalIqd: true,
        items: {
          select: { unitPriceIqd: true, quantity: true, lineTotalIqd: true, sku: true },
        },
        payment: { select: { status: true, amountIqd: true } },
        events: { select: { fromStatus: true, toStatus: true } },
      },
    });

    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.subtotalIqd).toBe(770_000);
    // The database's own CHECK: total = subtotal - discount + delivery.
    expect(order.totalIqd).toBe(
      order.subtotalIqd - order.discountIqd + order.deliveryIqd,
    );
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      unitPriceIqd: 385_000,
      quantity: 2,
      lineTotalIqd: 770_000,
    });
    // The payment must be for the whole total, delivery included.
    expect(order.payment).toMatchObject({
      status: PaymentStatus.PENDING,
      amountIqd: order.totalIqd,
    });
    expect(order.events).toEqual([{ fromStatus: null, toStatus: OrderStatus.PENDING }]);
  });

  it('empties the cart but keeps it, so the visitor keeps their token', async () => {
    const { variantId } = await fixture({ priceIqd: 12_000, trackQuantity: false });
    const cartId = await createCartWith(variantId, 1);

    await placeOrder(cartId, ADDRESS);

    expect(await db.cartItem.count({ where: { cartId } })).toBe(0);
    expect(await db.cart.findUnique({ where: { id: cartId } })).not.toBeNull();
  });

  it('refuses an empty cart', async () => {
    const cart = await db.cart.create({
      data: { token: `itest-empty-${Math.random().toString(36).slice(2)}` },
      select: { id: true },
    });
    await expect(placeOrder(cart.id, ADDRESS)).rejects.toThrow(PlaceOrderError);
  });

  it('ignores any price the caller thinks it knows', async () => {
    // The input type has nowhere to put money, so this asserts the shape of the
    // contract: extra fields are dropped, and the total comes from the row.
    const { variantId } = await fixture({ priceIqd: 500_000, trackQuantity: false });
    const cartId = await createCartWith(variantId, 1);

    const placed = await placeOrder(cartId, {
      ...ADDRESS,
      ...({ totalIqd: 1, subtotalIqd: 1, deliveryIqd: 0 } as object),
    });

    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: placed.orderNumber },
      select: { subtotalIqd: true, totalIqd: true },
    });
    expect(order.subtotalIqd).toBe(500_000);
    expect(order.totalIqd).toBeGreaterThanOrEqual(500_000);
  });

  it('rolls the whole thing back when a line cannot be supplied', async () => {
    const { variantId } = await fixture({
      priceIqd: 100_000,
      trackQuantity: true,
      onHand: 1,
    });
    const cartId = await createCartWith(variantId, 5);

    await expect(placeOrder(cartId, ADDRESS)).rejects.toThrow(PlaceOrderError);

    // Nothing may survive a failed order: no order row, no reservation, and
    // the cart still holds what the customer put in it.
    expect(await db.order.count({ where: { fullName: ADDRESS.fullName } })).toBe(0);
    const inventory = await db.inventory.findUniqueOrThrow({
      where: { variantId },
      select: { reserved: true },
    });
    expect(inventory.reserved).toBe(0);
    expect(await db.cartItem.count({ where: { cartId } })).toBe(1);
  });
});

describe('concurrent checkout', () => {
  it('sells the last unit exactly once', async () => {
    const { variantId } = await fixture({
      priceIqd: 250_000,
      trackQuantity: true,
      onHand: 1,
    });

    // Two shoppers, two carts, one unit of stock.
    const [cartA, cartB] = await Promise.all([
      createCartWith(variantId, 1),
      createCartWith(variantId, 1),
    ]);

    const results = await Promise.allSettled([
      placeOrder(cartA, ADDRESS),
      placeOrder(cartB, ADDRESS),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // This is the whole point: a read-then-write in JavaScript would let both
    // through, because both read onHand=1 before either wrote.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const inventory = await db.inventory.findUniqueOrThrow({
      where: { variantId },
      select: { onHand: true, reserved: true },
    });
    expect(inventory.reserved).toBe(1);
    // The table's CHECK constraint is the second line of defence.
    expect(inventory.reserved).toBeLessThanOrEqual(inventory.onHand);

    expect(await db.order.count({ where: { fullName: ADDRESS.fullName } })).toBe(1);
  });

  it('gives concurrent orders distinct order numbers', async () => {
    const { variantId } = await fixture({ priceIqd: 30_000, trackQuantity: false });
    const carts = await Promise.all([
      createCartWith(variantId, 1),
      createCartWith(variantId, 1),
      createCartWith(variantId, 1),
    ]);

    const results = await Promise.allSettled(
      carts.map((cartId) => placeOrder(cartId, ADDRESS)),
    );
    const numbers = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value.orderNumber);

    // Whatever survives contention, no two orders may share a reference — the
    // customer reads it down the phone to identify their delivery.
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers.length).toBeGreaterThan(0);
    for (const number of numbers) {
      expect(number).toMatch(/^MPS-\d{5}-\d{4,}$/);
    }
  });

  it('does not reserve anything for a variant that is not counted', async () => {
    // MPS sells on status, so this is the common path: no reservation at all.
    const { variantId } = await fixture({ priceIqd: 68_000, trackQuantity: false });
    const cartId = await createCartWith(variantId, 3);

    await placeOrder(cartId, ADDRESS);

    const inventory = await db.inventory.findUniqueOrThrow({
      where: { variantId },
      select: { reserved: true },
    });
    expect(inventory.reserved).toBe(0);
    expect(
      await db.inventoryMovement.count({ where: { inventory: { variantId } } }),
    ).toBe(0);
  });
});
