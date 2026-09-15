import 'server-only';

import {
  InventoryMovementType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  type Governorate,
} from '@prisma/client';
import { db, type DbTransaction } from '@/server/db/client';
import { getCurrentUser } from '@/server/auth/guards';
import { cartTotals, orderTotals, quoteDelivery } from '@/lib/domain/cart';
import { evaluateCoupon, type CouponRefusal } from '@/lib/domain/coupon';
import { isPurchasable } from '@/lib/domain/availability';
import {
  formatOrderNumber,
  ORDER_NUMBER_PREFIX,
  orderNumberDayKey,
  sequenceFromOrderNumber,
} from '@/lib/domain/order-number';
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
  | { code: 'insufficientStock'; variantId: string; nameAr: string; nameEn: string }
  /*
    The whole order fails on a bad code rather than quietly dropping it.
    Placing the order anyway at full price is the worse outcome by far: the
    customer pressed the button expecting a discount, and the first they would
    know is the courier asking for more money.
  */
  | { code: 'couponRejected'; reason: CouponRefusal };

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

/**
 * The two keys `pg_advisory_xact_lock` is called with.
 *
 * Postgres advisory locks are a namespace of integers shared by the whole
 * database, so the first is a constant that says "this is order numbering" and
 * the second is the day being numbered. Locking per day rather than globally
 * means checkouts on different days never wait for each other — which matters
 * only at midnight, and costs nothing the rest of the time.
 */
const ORDER_NUMBER_LOCK = 4_820_001;

/** Days since the epoch: a stable small integer for the second lock key. */
function dayKey(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000,
  );
}

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
 * What a code is worth, for showing the customer before they commit.
 *
 * The same rules and the same row as `resolveCoupon`, without claiming a use —
 * a quote must never consume one, or refreshing the page would burn a
 * single-use code. Nothing here is authoritative: the order transaction runs
 * the whole evaluation again from scratch, because between the quote and the
 * button somebody else may have taken the last use.
 */
export async function quoteCoupon(
  code: string,
  subtotalIqd: number,
): Promise<
  { ok: true; code: string; discountIqd: number } | { ok: false; reason: CouponRefusal }
> {
  const user = await getCurrentUser();

  const coupon = await db.coupon.findUnique({
    where: { code },
    select: {
      id: true,
      discountType: true,
      discountValue: true,
      minOrderIqd: true,
      maxDiscountIqd: true,
      usageLimit: true,
      usageCount: true,
      perUserLimit: true,
      startsAt: true,
      endsAt: true,
      isActive: true,
    },
  });

  if (!coupon) return { ok: false, reason: 'couponInvalid' };

  const usedByThisUser = user
    ? await db.couponUsage.count({ where: { couponId: coupon.id, userId: user.id } })
    : null;

  const evaluation = evaluateCoupon(coupon, {
    subtotalIqd,
    now: new Date(),
    usedByThisUser,
  });

  return evaluation.ok
    ? { ok: true, code, discountIqd: evaluation.discountIqd }
    : { ok: false, reason: evaluation.reason };
}

/**
 * Look the coupon up and decide what it is worth, or refuse the order.
 *
 * Inside the transaction, from the row, using the same pure rules that quoted
 * it — so the number the customer was shown and the number they are charged
 * cannot come from different places (§13.7).
 *
 * The per-user count is only meaningful for a signed-in customer. A guest
 * checkout has no account to count against, so `usedByThisUser` is null and
 * the per-user limit does not apply; the global `usageLimit` still does, and
 * it is the control that actually bounds what a code can cost.
 */
async function resolveCoupon(
  tx: DbTransaction,
  code: string,
  subtotalIqd: number,
  userId: string | null,
): Promise<{ id: string; discountIqd: number }> {
  const coupon = await tx.coupon.findUnique({
    where: { code },
    select: {
      id: true,
      discountType: true,
      discountValue: true,
      minOrderIqd: true,
      maxDiscountIqd: true,
      usageLimit: true,
      usageCount: true,
      perUserLimit: true,
      startsAt: true,
      endsAt: true,
      isActive: true,
    },
  });

  // A code that does not exist and one that is switched off answer the same
  // way, and `evaluateCoupon` keeps it that way for the dates too.
  if (!coupon) {
    throw new PlaceOrderError({ code: 'couponRejected', reason: 'couponInvalid' });
  }

  const usedByThisUser = userId
    ? await tx.couponUsage.count({ where: { couponId: coupon.id, userId } })
    : null;

  const evaluation = evaluateCoupon(coupon, {
    subtotalIqd,
    now: new Date(),
    usedByThisUser,
  });

  if (!evaluation.ok) {
    throw new PlaceOrderError({ code: 'couponRejected', reason: evaluation.reason });
  }

  return { id: coupon.id, discountIqd: evaluation.discountIqd };
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
  tx: DbTransaction,
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

    /*
      The coupon is resolved from the row, inside this transaction, by the same
      function that quoted it to the customer a moment ago. Nothing about the
      discount crosses the wire — only the code did.
    */
    const coupon = input.couponCode
      ? await resolveCoupon(tx, input.couponCode, subtotalIqd, user?.id ?? null)
      : null;

    const totals = orderTotals({
      subtotalIqd,
      discountIqd: coupon?.discountIqd ?? 0,
      deliveryIqd: delivery.feeIqd,
    });

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

    /*
      One transaction at a time allocates a number for a given day.

      The retry-on-collision loop that used to be here could not work, and the
      probe that proved it is why this lock exists. Two simultaneous checkouts
      both count the day's orders, both get the same sequence, and the second
      `INSERT` violates `order_orderNumber_key` — at which point **Postgres
      aborts the whole transaction** (25P02, "current transaction is aborted").
      The next attempt in the loop then runs against a dead transaction and
      fails with an unrelated error, so the customer met "something went wrong"
      on a checkout that should simply have been numbered 0045.

      A transaction-scoped advisory lock removes the race instead of reacting
      to it: the second checkout waits here, then counts AFTER the first has
      committed and takes the next number. It is released automatically on
      commit or rollback, so a failed order cannot hold it.
    */
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ORDER_NUMBER_LOCK}, ${dayKey(placedAt)})`;

    /*
      The next number comes from the HIGHEST one issued today, not from a count
      of today's rows. Counting looks equivalent and is not: delete one order
      from the middle of a day and the count drops, so the next order is handed
      a number that already exists. Found exactly that way, by a test suite
      cleaning up after itself.

      The `<NNNN>` segment is zero-padded to a fixed width, so ordering the
      day's numbers as text orders them as numbers.
    */
    const latest = await tx.order.findFirst({
      where: {
        orderNumber: {
          startsWith: `${ORDER_NUMBER_PREFIX}-${orderNumberDayKey(placedAt)}-`,
        },
      },
      select: { orderNumber: true },
      orderBy: { orderNumber: 'desc' },
    });

    const sequence =
      (latest ? (sequenceFromOrderNumber(latest.orderNumber) ?? 0) : 0) + 1;

    const order = await tx.order.create({
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

    /*
      Claim the use, now that there is an order to attach it to.

      A conditional UPDATE rather than read-then-write, for the reason stock
      reservation uses one: two checkouts can both read `usageCount = 9`
      against a limit of 10 and both pass the check above, because both read
      before either wrote.

      **Today the advisory lock above already prevents that**, because it
      serialises order creation for the day and this runs inside the same
      transaction — measured, not assumed: with a read-then-write here the
      concurrency test still passes. It stays anyway, and the honesty is the
      point. The invariant is "a ten-use code is used ten times", and that must
      not depend on where an unrelated lock happens to sit. `reserved <=
      onHand` is enforced twice for the same reason (§12).
    */
    if (coupon) {
      const claimed = await tx.$executeRaw`
        UPDATE "coupon"
           SET "usageCount" = "usageCount" + 1, "updatedAt" = NOW()
         WHERE "id" = ${coupon.id}
           AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")
      `;

      if (claimed !== 1) {
        throw new PlaceOrderError({
          code: 'couponRejected',
          reason: 'couponExhausted',
        });
      }

      await tx.couponUsage.create({
        data: {
          couponId: coupon.id,
          userId: user?.id ?? null,
          orderId: order.id,
          discountIqd: coupon.discountIqd,
        },
      });
    }

    // The cart is emptied, not deleted, so the visitor's token stays valid and
    // they can keep shopping without a new cookie round-trip.
    await tx.cartItem.deleteMany({ where: { cartId } });

    return { orderNumber: order.orderNumber, totalIqd: totals.totalIqd };
  });
}
