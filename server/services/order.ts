import 'server-only';

import {
  InventoryMovementType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  type Governorate,
} from '@prisma/client';
import { db } from '@/server/db/client';
import { getCurrentUser } from '@/server/auth/guards';
import { cartTotals, orderTotals, quoteDelivery } from '@/lib/domain/cart';
import { isPurchasable } from '@/lib/domain/availability';
import { formatOrderNumber } from '@/lib/domain/order-number';
import type { CheckoutInput } from '@/schemas/checkout';

/**
 * Order placement.
 *
 * This is the one function in MPS where being wrong costs real money, so it is
 * written defensively:
 *
 *  - **Every figure is recomputed here**, from the variant rows and the
 *    `DeliveryRate` table, inside the transaction. Nothing the client sent is
 *    trusted, and nothing rendered earlier is reused — a price that changed
 *    while the customer was filling in the form is caught now, not honoured.
 *  - **Everything happens in one transaction.** An order with items but no
 *    payment row, or stock reserved against an order that was never written,
 *    are states the database should never be able to hold.
 *  - **Prices, names and SKUs are snapshotted** into `OrderItem`. Editing a
 *    product tomorrow must not rewrite last week's invoice.
 *  - **Stock is reserved only for variants that count it.** MPS sells on
 *    status, so for most variants there is nothing to reserve.
 */

export type PlaceOrderFailure =
  | { code: 'emptyCart' }
  | { code: 'priceChanged'; variantId: string }
  | { code: 'unavailable'; variantId: string; nameAr: string; nameEn: string }
  | { code: 'insufficientStock'; variantId: string; nameAr: string; nameEn: string };

export class PlaceOrderError extends Error {
  constructor(readonly failure: PlaceOrderFailure) {
    super(`order could not be placed: ${failure.code}`);
    this.name = 'PlaceOrderError';
  }
}

/**
 * Lets the confirmation page prove this browser is the one that ordered.
 *
 * Set at checkout, read on the order page. It lives here rather than beside
 * the action because a 'use server' module may only export async functions.
 */
export const RECENT_ORDER_COOKIE = 'mps.recent_order';

/** One day: long enough to reopen the tab, short enough not to linger. */
export const RECENT_ORDER_MAX_AGE = 60 * 60 * 24;

/** How many times to retry when two orders land on the same number. */
const ORDER_NUMBER_ATTEMPTS = 5;

/**
 * Delivery cost for a subtotal and governorate, straight from the database.
 *
 * Exported because the checkout page quotes it live as the customer picks a
 * governorate, and that quote must come from the same code that will charge
 * them — a second implementation for display is how a store ends up showing
 * one fee and billing another.
 */
export async function quoteDeliveryFor(governorate: Governorate, subtotalIqd: number) {
  const [rate, settings] = await Promise.all([
    db.deliveryRate.findFirst({
      where: { governorate, isActive: true },
      select: { feeIqd: true, etaMinDays: true, etaMaxDays: true },
    }),
    db.siteSetting.findFirst({
      select: { defaultDeliveryIqd: true, freeDeliveryOverIqd: true },
    }),
  ]);

  return quoteDelivery(subtotalIqd, rate, {
    defaultDeliveryIqd: settings?.defaultDeliveryIqd ?? 5000,
    freeDeliveryOverIqd: settings?.freeDeliveryOverIqd ?? null,
  });
}

/**
 * Reserve counted stock atomically.
 *
 * The condition lives in the UPDATE's WHERE clause, not in a read-then-write in
 * JavaScript, because two checkouts for the last phone will both pass a
 * JavaScript check and both write. Postgres evaluates `onHand - reserved >= n`
 * while holding the row lock, so exactly one of them updates a row and the
 * other gets a count of 0 and aborts the whole transaction.
 *
 * `reserved <= onHand` is also a CHECK constraint on the table — the same
 * invariant enforced twice, so a future code path that forgets this function
 * still cannot oversell.
 */
async function reserveStock(
  tx: Prisma.TransactionClient,
  variantId: string,
  quantity: number,
): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE "inventory"
       SET "reserved" = "reserved" + ${quantity}, "updatedAt" = NOW()
     WHERE "variantId" = ${variantId}
       AND "trackQuantity" = true
       AND "onHand" - "reserved" >= ${quantity}
  `;
  return updated === 1;
}

export interface PlacedOrder {
  orderNumber: string;
  totalIqd: number;
}

/**
 * Turn a cart into an order.
 *
 * `cartId` is resolved by the caller from the cart cookie or session, never
 * accepted from a form — otherwise anyone could check out somebody else's cart.
 */
export async function placeOrder(
  cartId: string,
  input: CheckoutInput,
): Promise<PlacedOrder> {
  const user = await getCurrentUser();

  return db.$transaction(async (tx) => {
    const items = await tx.cartItem.findMany({
      where: { cartId },
      select: {
        quantity: true,
        variant: {
          select: {
            id: true,
            sku: true,
            labelAr: true,
            labelEn: true,
            priceIqd: true,
            isActive: true,
            imageUrl: true,
            inventory: {
              select: {
                id: true,
                trackQuantity: true,
                status: true,
                onHand: true,
                reserved: true,
              },
            },
            product: {
              select: {
                isPublished: true,
                nameAr: true,
                nameEn: true,
                brand: { select: { nameAr: true, nameEn: true } },
                images: {
                  select: { url: true },
                  orderBy: { sortOrder: 'asc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (items.length === 0) throw new PlaceOrderError({ code: 'emptyCart' });

    // -- Validate every line before writing anything --------------------------
    for (const item of items) {
      const { variant } = item;
      if (!variant.isActive || !variant.product.isPublished || !variant.inventory) {
        throw new PlaceOrderError({
          code: 'unavailable',
          variantId: variant.id,
          nameAr: variant.product.nameAr,
          nameEn: variant.product.nameEn,
        });
      }
      if (!isPurchasable(variant.inventory, item.quantity)) {
        throw new PlaceOrderError({
          code: variant.inventory.trackQuantity ? 'insufficientStock' : 'unavailable',
          variantId: variant.id,
          nameAr: variant.product.nameAr,
          nameEn: variant.product.nameEn,
        });
      }
    }

    // -- Money, computed here and nowhere else --------------------------------
    const lines = items.map((item) => ({
      unitPriceIqd: item.variant.priceIqd,
      quantity: item.quantity,
    }));
    const { subtotalIqd } = cartTotals(lines);
    const delivery = await quoteDeliveryFor(input.governorate, subtotalIqd);
    const totals = orderTotals({ subtotalIqd, deliveryIqd: delivery.feeIqd });

    // -- Reserve counted stock ------------------------------------------------
    for (const item of items) {
      if (!item.variant.inventory?.trackQuantity) continue;
      const ok = await reserveStock(tx, item.variant.id, item.quantity);
      if (!ok) {
        // Someone else took the last unit between the check above and here.
        throw new PlaceOrderError({
          code: 'insufficientStock',
          variantId: item.variant.id,
          nameAr: item.variant.product.nameAr,
          nameEn: item.variant.product.nameEn,
        });
      }
    }

    // -- Create the order, retrying only on a number collision ----------------
    const placedAt = new Date();
    const dayStart = new Date(
      Date.UTC(
        placedAt.getUTCFullYear(),
        placedAt.getUTCMonth(),
        placedAt.getUTCDate(),
      ),
    );

    let order: { id: string; orderNumber: string } | null = null;
    let sequence = await tx.order.count({ where: { placedAt: { gte: dayStart } } });

    for (let attempt = 0; attempt < ORDER_NUMBER_ATTEMPTS; attempt++) {
      sequence += 1;
      try {
        order = await tx.order.create({
          data: {
            orderNumber: formatOrderNumber(placedAt, sequence),
            userId: user?.id ?? null,
            status: OrderStatus.PENDING,
            fullName: input.fullName,
            phone: input.phone,
            governorate: input.governorate,
            city: input.city,
            addressLine: input.addressLine,
            notes: input.notes,
            subtotalIqd: totals.subtotalIqd,
            discountIqd: totals.discountIqd,
            deliveryIqd: totals.deliveryIqd,
            totalIqd: totals.totalIqd,
            placedAt,
          },
          select: { id: true, orderNumber: true },
        });
        break;
      } catch (error) {
        // P2002 is a unique-constraint violation: two checkouts raced for the
        // same daily sequence. Any other error is real and must not be retried.
        const collided =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (!collided || attempt === ORDER_NUMBER_ATTEMPTS - 1) throw error;
      }
    }

    if (!order) throw new Error('could not allocate an order number');

    // -- Snapshot the lines ---------------------------------------------------
    await tx.orderItem.createMany({
      data: items.map((item) => ({
        orderId: order.id,
        variantId: item.variant.id,
        productNameAr: item.variant.product.nameAr,
        productNameEn: item.variant.product.nameEn,
        brandName: item.variant.product.brand.nameEn,
        sku: item.variant.sku,
        variantLabelAr: item.variant.labelAr,
        variantLabelEn: item.variant.labelEn,
        imageUrl: item.variant.imageUrl ?? item.variant.product.images[0]?.url ?? null,
        unitPriceIqd: item.variant.priceIqd,
        quantity: item.quantity,
        lineTotalIqd: item.variant.priceIqd * item.quantity,
      })),
    });

    // -- Payment, timeline, stock ledger --------------------------------------
    await tx.payment.create({
      data: {
        orderId: order.id,
        method: PaymentMethod.CASH_ON_DELIVERY,
        status: PaymentStatus.PENDING,
        amountIqd: totals.totalIqd,
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        fromStatus: null,
        toStatus: OrderStatus.PENDING,
        note: 'Order placed',
        actorId: user?.id ?? null,
      },
    });

    for (const item of items) {
      const inventory = item.variant.inventory;
      if (!inventory?.trackQuantity) continue;
      await tx.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          type: InventoryMovementType.ORDER_RESERVED,
          quantity: item.quantity,
          onHandAfter: inventory.onHand,
          reservedAfter: inventory.reserved + item.quantity,
          orderId: order.id,
          actorId: user?.id ?? null,
        },
      });
    }

    // The cart is emptied, not deleted, so the visitor's token stays valid and
    // they can keep shopping without a new cookie round-trip.
    await tx.cartItem.deleteMany({ where: { cartId } });

    return { orderNumber: order.orderNumber, totalIqd: totals.totalIqd };
  });
}
