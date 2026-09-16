import 'server-only';

import {
  InventoryMovementType,
  OrderStatus,
  PaymentStatus,
  type Prisma,
} from '@prisma/client';
import { db, type DbTransaction } from '@/server/db/client';
import { requireStaff } from '@/server/auth/guards';
import { assertTransition, holdsReservation } from '@/lib/domain/order-state';

/**
 * Order administration.
 *
 * Every function here starts with `requireStaff()`. That is not belt-and-braces
 * over the admin layout's redirect — the layout is a courtesy that stops a
 * customer seeing a broken page, while a Server Action can be invoked directly
 * by anyone who has the page's action id, with no layout involved at all
 * (CLAUDE.md §7). The guard is the protection; the route is the manners.
 */

export class OrderAdminError extends Error {
  constructor(
    message: string,
    /** Key under the `admin` namespace in messages/, so the UI can translate it. */
    readonly code:
      | 'notFound'
      | 'illegalTransition'
      | 'reservationUnderflow'
      /** Somebody else moved this order between the read and the write. */
      | 'statusChanged',
  ) {
    super(message);
    this.name = 'OrderAdminError';
  }
}

/**
 * Release the stock an order was holding.
 *
 * Mirrors the reservation in `placeOrder`: the condition lives in the UPDATE's
 * WHERE clause so two staff cancelling the same order in two tabs cannot drive
 * `reserved` below zero. The second one updates no row and is reported rather
 * than silently corrupting the count.
 *
 * Only variants with `trackQuantity` ever held anything, so the rest are
 * skipped entirely.
 */
async function releaseReservation(
  tx: DbTransaction,
  orderId: string,
  actorId: string,
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId, variantId: { not: null } },
    select: {
      quantity: true,
      variant: {
        select: {
          id: true,
          inventory: {
            select: { id: true, trackQuantity: true, onHand: true, reserved: true },
          },
        },
      },
    },
  });

  for (const item of items) {
    const inventory = item.variant?.inventory;
    if (!inventory?.trackQuantity) continue;

    const released = await tx.$executeRaw`
      UPDATE "inventory"
         SET "reserved" = "reserved" - ${item.quantity}, "updatedAt" = NOW()
       WHERE "id" = ${inventory.id}
         AND "reserved" >= ${item.quantity}
    `;

    if (released !== 1) {
      throw new OrderAdminError(
        `cannot release ${item.quantity} from inventory ${inventory.id}`,
        'reservationUnderflow',
      );
    }

    await tx.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        type: InventoryMovementType.ORDER_RELEASED,
        quantity: -item.quantity,
        onHandAfter: inventory.onHand,
        reservedAfter: inventory.reserved - item.quantity,
        orderId,
        actorId,
      },
    });
  }
}

/**
 * Convert a reservation into a sale: the units have left the building.
 *
 * onHand and reserved both come down, so the remaining count stays truthful.
 */
async function fulfilReservation(
  tx: DbTransaction,
  orderId: string,
  actorId: string,
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId, variantId: { not: null } },
    select: {
      quantity: true,
      variant: {
        select: {
          inventory: {
            select: { id: true, trackQuantity: true, onHand: true, reserved: true },
          },
        },
      },
    },
  });

  for (const item of items) {
    const inventory = item.variant?.inventory;
    if (!inventory?.trackQuantity) continue;

    const fulfilled = await tx.$executeRaw`
      UPDATE "inventory"
         SET "onHand" = "onHand" - ${item.quantity},
             "reserved" = "reserved" - ${item.quantity},
             "updatedAt" = NOW()
       WHERE "id" = ${inventory.id}
         AND "reserved" >= ${item.quantity}
         AND "onHand" >= ${item.quantity}
    `;

    if (fulfilled !== 1) {
      throw new OrderAdminError(
        `cannot fulfil ${item.quantity} from inventory ${inventory.id}`,
        'reservationUnderflow',
      );
    }

    await tx.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        type: InventoryMovementType.ORDER_FULFILLED,
        quantity: -item.quantity,
        onHandAfter: inventory.onHand - item.quantity,
        reservedAfter: inventory.reserved - item.quantity,
        orderId,
        actorId,
      },
    });
  }
}

export interface AdvanceOrderInput {
  orderNumber: string;
  toStatus: OrderStatus;
  note?: string | null;
}

/**
 * Move an order to its next status.
 *
 * The transition is validated by the same state machine the tests cover, so a
 * DELIVERED order cannot be dragged back to PENDING by a double-click, a stale
 * tab, or a crafted request. Everything that follows from the move — the
 * timeline entry, the timestamps, the payment, the stock ledger — happens in
 * the same transaction, because an order that is CANCELLED but still holding
 * stock is a state the business cannot reason about.
 */
export async function advanceOrder(input: AdvanceOrderInput): Promise<void> {
  const staff = await requireStaff();

  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { orderNumber: input.orderNumber },
      select: { id: true, status: true },
    });

    if (!order) {
      throw new OrderAdminError(`no order ${input.orderNumber}`, 'notFound');
    }

    // Throws InvalidOrderTransitionError on anything backwards or skipped.
    assertTransition(order.status, input.toStatus);

    const now = new Date();
    const timestamps: Prisma.OrderUpdateInput = {};
    if (input.toStatus === OrderStatus.CONFIRMED) timestamps.confirmedAt = now;
    if (input.toStatus === OrderStatus.DELIVERED) timestamps.deliveredAt = now;
    if (input.toStatus === OrderStatus.CANCELLED) {
      timestamps.cancelledAt = now;
      timestamps.cancelReason = input.note ?? null;
    }

    /*
      Compare-and-set, not `update where id`.

      Everything above this line is a read followed by a decision, which two
      staff in two tabs make identically: both read PENDING, both find the move
      to CONFIRMED legal, and — with `where: { id }` — both write it. The
      order ends up in the right state by luck, and the rest does not: two
      timeline events for one transition, a cancel that releases the same
      reservation twice, a delivery that settles the payment twice.

      The expected status goes in the WHERE clause instead, so Postgres decides
      who won. The loser updates no row, and is told to look again rather than
      being allowed to act on a state that has already moved. Same shape as the
      stock reservation in `placeOrder` and the coupon claim, and for the same
      reason: the invariant belongs in the statement, not in the gap before it.
    */
    const claimed = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: input.toStatus, ...timestamps },
    });

    if (claimed.count !== 1) {
      throw new OrderAdminError(
        `order ${input.orderNumber} moved out of ${order.status} concurrently`,
        'statusChanged',
      );
    }

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: input.toStatus,
        note: input.note ?? null,
        actorId: staff.id,
      },
    });

    // -- Stock ---------------------------------------------------------------
    // Only orders that were actually holding a reservation have anything to
    // give back or consume.
    const wasHolding = holdsReservation(order.status);

    if (wasHolding && input.toStatus === OrderStatus.CANCELLED) {
      await releaseReservation(tx, order.id, staff.id);
    }
    if (wasHolding && input.toStatus === OrderStatus.DELIVERED) {
      await fulfilReservation(tx, order.id, staff.id);
    }

    // -- Payment -------------------------------------------------------------
    // Cash on delivery: the money arrives when the courier hands it over, so
    // DELIVERED is the only event that marks it paid.
    if (input.toStatus === OrderStatus.DELIVERED) {
      await tx.payment.updateMany({
        where: { orderId: order.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.PAID, paidAt: now },
      });
    }
    if (input.toStatus === OrderStatus.CANCELLED) {
      await tx.payment.updateMany({
        where: { orderId: order.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      });
    }
    if (input.toStatus === OrderStatus.RETURNED) {
      await tx.payment.updateMany({
        where: { orderId: order.id, status: PaymentStatus.PAID },
        data: { status: PaymentStatus.REFUNDED },
      });
    }
  });
}
