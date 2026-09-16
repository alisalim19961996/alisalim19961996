import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Governorate,
  InventoryMovementType,
  OrderStatus,
  PaymentStatus,
  Role,
  StockStatus,
} from '@prisma/client';

/**
 * Order administration against a real database.
 *
 * The reason this needs Postgres rather than a mock: cancelling an order has
 * to give counted stock back, delivering has to consume it, and both happen in
 * a transaction alongside the status change and the payment. A fake would let
 * every one of those drift apart silently.
 */

/** The staff member every write is attributed to. */
const STAFF = { id: '', name: 'Integration Staff', role: Role.ADMIN };

// requireStaff() reads the session from request headers, which do not exist in
// a test runner. Stubbing the guard is the only way in — and it is exactly the
// thing the service would refuse without.
vi.mock('@/server/auth/guards', () => ({
  getCurrentUser: async () => (STAFF.id ? STAFF : null),
  requireStaff: async () => {
    if (!STAFF.id) throw new Error('not staff');
    return STAFF;
  },
  requireAdmin: async () => {
    if (!STAFF.id) throw new Error('not admin');
    return STAFF;
  },
}));

const { db } = await import('@/server/db/client');
const { placeOrder } = await import('@/server/services/order');
const { advanceOrder, OrderAdminError } =
  await import('@/server/services/admin-orders');
const { InvalidOrderTransitionError } = await import('@/lib/domain/order-state');

const ADDRESS = {
  fullName: 'Admin Integration Test',
  phone: '+9647700000001',
  governorate: Governorate.BAGHDAD,
  city: 'Karrada',
  addressLine: 'Street 62, house 14',
  notes: null,
  couponCode: null,
};

const createdProductIds: string[] = [];

async function fixture(options: { trackQuantity: boolean; onHand?: number }) {
  const suffix = Math.random().toString(36).slice(2, 10);

  const [productType, brand, category] = await Promise.all([
    db.productType.findFirstOrThrow({ select: { id: true } }),
    db.brand.findFirstOrThrow({ select: { id: true } }),
    db.category.findFirstOrThrow({ select: { id: true } }),
  ]);

  const product = await db.product.create({
    data: {
      slugAr: `aitest-${suffix}`,
      slugEn: `aitest-${suffix}`,
      nameAr: `منتج ${suffix}`,
      nameEn: `Product ${suffix}`,
      productTypeId: productType.id,
      brandId: brand.id,
      categoryId: category.id,
      isPublished: true,
      minPriceIqd: 100_000,
      variants: {
        create: {
          sku: `AITEST-${suffix}`,
          labelAr: 'اختبار',
          labelEn: 'Test',
          priceIqd: 100_000,
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

  createdProductIds.push(product.id);
  return { variantId: product.variants[0]!.id };
}

async function placeOne(variantId: string, quantity = 1) {
  const cart = await db.cart.create({
    data: {
      token: `aitest-${Math.random().toString(36).slice(2)}`,
      items: { create: { variantId, quantity } },
    },
    select: { id: true },
  });
  return placeOrder(cart.id, ADDRESS);
}

const inventoryOf = (variantId: string) =>
  db.inventory.findUniqueOrThrow({
    where: { variantId },
    select: { onHand: true, reserved: true },
  });

beforeEach(async () => {
  // A real staff row, so actorId satisfies the foreign key and the timeline
  // can show who did what.
  const staff = await db.user.upsert({
    where: { email: 'integration-staff@mps.local' },
    create: {
      email: 'integration-staff@mps.local',
      name: STAFF.name,
      role: Role.ADMIN,
      emailVerified: false,
    },
    update: {},
    select: { id: true },
  });
  STAFF.id = staff.id;

  await db.order.deleteMany({ where: { fullName: ADDRESS.fullName } });
});

afterAll(async () => {
  await db.order.deleteMany({ where: { fullName: ADDRESS.fullName } });
  await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await db.user.deleteMany({ where: { email: 'integration-staff@mps.local' } });
  await db.$disconnect();
});

describe('advanceOrder', () => {
  it('records who moved the order and writes the timeline entry', async () => {
    const { variantId } = await fixture({ trackQuantity: false });
    const { orderNumber } = await placeOne(variantId);

    await advanceOrder({ orderNumber, toStatus: OrderStatus.CONFIRMED });

    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber },
      select: {
        status: true,
        confirmedAt: true,
        events: {
          select: { fromStatus: true, toStatus: true, actorId: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(order.confirmedAt).not.toBeNull();
    expect(order.events.at(-1)).toMatchObject({
      fromStatus: OrderStatus.PENDING,
      toStatus: OrderStatus.CONFIRMED,
      actorId: STAFF.id,
    });
  });

  it('refuses a backwards move', async () => {
    const { variantId } = await fixture({ trackQuantity: false });
    const { orderNumber } = await placeOne(variantId);
    await advanceOrder({ orderNumber, toStatus: OrderStatus.CONFIRMED });

    await expect(
      advanceOrder({ orderNumber, toStatus: OrderStatus.PENDING }),
    ).rejects.toThrow(InvalidOrderTransitionError);
  });

  it('refuses a skipped step', async () => {
    const { variantId } = await fixture({ trackQuantity: false });
    const { orderNumber } = await placeOne(variantId);

    await expect(
      advanceOrder({ orderNumber, toStatus: OrderStatus.DELIVERED }),
    ).rejects.toThrow(InvalidOrderTransitionError);
  });

  it('refuses an order that does not exist', async () => {
    await expect(
      advanceOrder({ orderNumber: 'MPS-26001-9999', toStatus: OrderStatus.CONFIRMED }),
    ).rejects.toThrow(OrderAdminError);
  });
});

describe('cancelling releases counted stock', () => {
  it('gives the units back and writes a ledger entry', async () => {
    const { variantId } = await fixture({ trackQuantity: true, onHand: 5 });
    const { orderNumber } = await placeOne(variantId, 2);

    // Placing the order reserved two of the five.
    expect(await inventoryOf(variantId)).toEqual({ onHand: 5, reserved: 2 });

    await advanceOrder({
      orderNumber,
      toStatus: OrderStatus.CANCELLED,
      note: 'Customer changed their mind',
    });

    // The units are available again, and onHand is untouched — nothing left.
    expect(await inventoryOf(variantId)).toEqual({ onHand: 5, reserved: 0 });

    const movements = await db.inventoryMovement.findMany({
      where: { inventory: { variantId } },
      select: { type: true, quantity: true, reservedAfter: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements.map((movement) => movement.type)).toEqual([
      InventoryMovementType.ORDER_RESERVED,
      InventoryMovementType.ORDER_RELEASED,
    ]);
    expect(movements.at(-1)).toMatchObject({ quantity: -2, reservedAfter: 0 });
  });

  it('frees the unit for the next customer', async () => {
    // The whole point: a cancelled order must not keep the last phone off sale.
    const { variantId } = await fixture({ trackQuantity: true, onHand: 1 });
    const first = await placeOne(variantId, 1);

    await expect(placeOne(variantId, 1)).rejects.toThrow();

    await advanceOrder({
      orderNumber: first.orderNumber,
      toStatus: OrderStatus.CANCELLED,
      note: 'Unreachable',
    });

    const second = await placeOne(variantId, 1);
    expect(second.orderNumber).toBeTruthy();
    expect(await inventoryOf(variantId)).toEqual({ onHand: 1, reserved: 1 });
  });

  it('marks the pending cash payment failed', async () => {
    const { variantId } = await fixture({ trackQuantity: false });
    const { orderNumber } = await placeOne(variantId);

    await advanceOrder({
      orderNumber,
      toStatus: OrderStatus.CANCELLED,
      note: 'Out of area',
    });

    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber },
      select: {
        cancelledAt: true,
        cancelReason: true,
        payment: { select: { status: true } },
      },
    });
    expect(order.cancelledAt).not.toBeNull();
    expect(order.cancelReason).toBe('Out of area');
    expect(order.payment?.status).toBe(PaymentStatus.FAILED);
  });

  it('does nothing to stock for a variant that is not counted', async () => {
    const { variantId } = await fixture({ trackQuantity: false });
    const { orderNumber } = await placeOne(variantId, 3);

    await advanceOrder({ orderNumber, toStatus: OrderStatus.CANCELLED, note: 'x' });

    expect(await inventoryOf(variantId)).toEqual({ onHand: 0, reserved: 0 });
    expect(
      await db.inventoryMovement.count({ where: { inventory: { variantId } } }),
    ).toBe(0);
  });
});

describe('delivering consumes counted stock', () => {
  it('takes the units off the shelf and marks cash received', async () => {
    const { variantId } = await fixture({ trackQuantity: true, onHand: 4 });
    const { orderNumber } = await placeOne(variantId, 3);

    for (const status of [
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.READY_FOR_SHIPMENT,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ]) {
      await advanceOrder({ orderNumber, toStatus: status });
    }

    // Sold, not merely unreserved: onHand comes down with reserved.
    expect(await inventoryOf(variantId)).toEqual({ onHand: 1, reserved: 0 });

    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber },
      select: {
        deliveredAt: true,
        payment: { select: { status: true, paidAt: true } },
      },
    });
    expect(order.deliveredAt).not.toBeNull();
    // Cash on delivery: the money exists only once the courier hands it over.
    expect(order.payment?.status).toBe(PaymentStatus.PAID);
    expect(order.payment?.paidAt).not.toBeNull();
  });

  it('refunds on a return', async () => {
    const { variantId } = await fixture({ trackQuantity: false });
    const { orderNumber } = await placeOne(variantId);

    for (const status of [
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.READY_FOR_SHIPMENT,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
      OrderStatus.RETURNED,
    ]) {
      await advanceOrder({ orderNumber, toStatus: status });
    }

    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber },
      select: { status: true, payment: { select: { status: true } } },
    });
    expect(order.status).toBe(OrderStatus.RETURNED);
    expect(order.payment?.status).toBe(PaymentStatus.REFUNDED);
  });
});

/**
 * Two staff, two tabs, one order.
 *
 * `advanceOrder` read the status, checked the transition, then wrote with
 * `where: { id }`. Both readers see PENDING, both find CONFIRMED legal, and
 * both write it — so the order lands in the right state by luck while
 * everything that follows from the move happens twice: two timeline events for
 * one transition, a cancel that releases the same reservation twice, a delivery
 * that settles the payment twice.
 *
 * The expected status is in the WHERE clause now, so Postgres picks the winner
 * and the loser is told to look again.
 */
describe('concurrent status changes', () => {
  it('lets exactly one of two identical moves win', async () => {
    const { variantId } = await fixture({ trackQuantity: false });
    const { orderNumber } = await placeOne(variantId);

    const results = await Promise.allSettled([
      advanceOrder({ orderNumber, toStatus: OrderStatus.CONFIRMED }),
      advanceOrder({ orderNumber, toStatus: OrderStatus.CONFIRMED }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber },
      select: { status: true, events: { select: { toStatus: true } } },
    });

    expect(order.status).toBe(OrderStatus.CONFIRMED);
    // The timeline is the part that used to double: PENDING, then CONFIRMED
    // once — not twice.
    expect(order.events.map((event) => event.toStatus)).toEqual([
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
    ]);
  });

  it('lets exactly one of two DIFFERENT moves win, and leaves the payment consistent', async () => {
    const { variantId } = await fixture({ trackQuantity: false });
    const { orderNumber } = await placeOne(variantId);

    // Confirming and cancelling are both legal from PENDING, and they settle
    // the payment in opposite directions — which is the state the business
    // cannot reason about if both land.
    const results = await Promise.allSettled([
      advanceOrder({ orderNumber, toStatus: OrderStatus.CONFIRMED }),
      advanceOrder({ orderNumber, toStatus: OrderStatus.CANCELLED, note: 'race' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber },
      select: {
        status: true,
        payment: { select: { status: true } },
        events: { select: { toStatus: true } },
      },
    });

    expect(order.events).toHaveLength(2);
    if (order.status === OrderStatus.CANCELLED) {
      expect(order.payment?.status).toBe(PaymentStatus.FAILED);
    } else {
      expect(order.status).toBe(OrderStatus.CONFIRMED);
      expect(order.payment?.status).toBe(PaymentStatus.PENDING);
    }
  });

  it('does not release a counted reservation twice', async () => {
    const { variantId } = await fixture({ trackQuantity: true, onHand: 5 });
    const { orderNumber } = await placeOne(variantId, 2);

    expect((await inventoryOf(variantId)).reserved).toBe(2);

    const results = await Promise.allSettled([
      advanceOrder({ orderNumber, toStatus: OrderStatus.CANCELLED, note: 'a' }),
      advanceOrder({ orderNumber, toStatus: OrderStatus.CANCELLED, note: 'b' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const inventory = await inventoryOf(variantId);
    expect(inventory.reserved).toBe(0);
    expect(inventory.onHand).toBe(5);
  });

  it('tells the loser the order moved, rather than failing silently', async () => {
    const { variantId } = await fixture({ trackQuantity: false });
    const { orderNumber } = await placeOne(variantId);

    const results = await Promise.allSettled([
      advanceOrder({ orderNumber, toStatus: OrderStatus.CONFIRMED }),
      advanceOrder({ orderNumber, toStatus: OrderStatus.CONFIRMED }),
    ]);

    const rejected = results.find((r) => r.status === 'rejected');
    const reason = rejected?.reason as unknown;
    // Either refusal is correct and which one arrives depends on where the
    // loser was when the winner committed: it read the old status and lost the
    // CAS, or it read the new one and the move is now illegal. Both say "look
    // again" to the person, and neither is a silent double write.
    expect(
      reason instanceof OrderAdminError ||
        reason instanceof InvalidOrderTransitionError,
    ).toBe(true);
    if (reason instanceof OrderAdminError) {
      expect(reason.code).toBe('statusChanged');
    }
  });
});
