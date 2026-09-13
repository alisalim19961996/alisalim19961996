import 'server-only';

import { OrderStatus, type PaymentStatus, type Prisma } from '@prisma/client';
import { db } from '@/server/db/client';
import { requireStaff } from '@/server/auth/guards';
import { allowedTransitions } from '@/lib/domain/order-state';
import type { Locale } from '@/i18n/routing';

/**
 * Dashboard reads.
 *
 * Guarded like the writes are: a read is what leaks a customer's phone number
 * and address, so `requireStaff()` belongs here just as much as on an update.
 *
 * Filtering and paging happen in SQL. An order list is the one screen that
 * will still be opened when there are fifty thousand rows.
 */

export const ORDERS_PER_PAGE = 25;

export interface OrderListRow {
  orderNumber: string;
  status: OrderStatus;
  placedAt: Date;
  fullName: string;
  phone: string;
  governorate: string;
  itemCount: number;
  totalIqd: number;
}

export interface OrderListResult {
  rows: OrderListRow[];
  total: number;
  page: number;
  pageCount: number;
  /** Row counts per status, for the filter tabs. */
  counts: Record<string, number>;
}

export async function getAdminOrders(options: {
  status?: OrderStatus;
  query?: string;
  page?: number;
}): Promise<OrderListResult> {
  await requireStaff();

  const page = Math.max(1, options.page ?? 1);
  const query = options.query?.trim();

  // Search accepts what staff have in front of them: the number the customer
  // read out, or the phone that called. Names are matched too, but they are
  // the least reliable of the three.
  const where: Prisma.OrderWhereInput = {
    ...(options.status ? { status: options.status } : {}),
    ...(query
      ? {
          OR: [
            { orderNumber: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
            { fullName: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total, grouped] = await Promise.all([
    db.order.findMany({
      where,
      select: {
        orderNumber: true,
        status: true,
        placedAt: true,
        fullName: true,
        phone: true,
        governorate: true,
        totalIqd: true,
        _count: { select: { items: true } },
      },
      orderBy: { placedAt: 'desc' },
      skip: (page - 1) * ORDERS_PER_PAGE,
      take: ORDERS_PER_PAGE,
    }),
    db.order.count({ where }),
    // Counts ignore the status filter on purpose: the tabs must keep showing
    // how much work is waiting elsewhere while one status is being worked on.
    db.order.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: query ? { ...where, status: undefined } : undefined,
    }),
  ]);

  const counts: Record<string, number> = {};
  let all = 0;
  for (const group of grouped) {
    counts[group.status] = group._count._all;
    all += group._count._all;
  }
  counts.ALL = all;

  return {
    rows: rows.map((row) => ({
      orderNumber: row.orderNumber,
      status: row.status,
      placedAt: row.placedAt,
      fullName: row.fullName,
      phone: row.phone,
      governorate: row.governorate,
      itemCount: row._count.items,
      totalIqd: row.totalIqd,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / ORDERS_PER_PAGE)),
    counts,
  };
}

export interface AdminOrderDetail {
  orderNumber: string;
  status: OrderStatus;
  placedAt: Date;
  fullName: string;
  phone: string;
  governorate: string;
  city: string;
  addressLine: string;
  notes: string | null;
  cancelReason: string | null;
  subtotalIqd: number;
  discountIqd: number;
  deliveryIqd: number;
  totalIqd: number;
  paymentStatus: PaymentStatus | null;
  lines: {
    name: string;
    sku: string;
    variantLabel: string;
    unitPriceIqd: number;
    quantity: number;
    lineTotalIqd: number;
  }[];
  timeline: {
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    note: string | null;
    actorName: string | null;
    at: Date;
  }[];
  /** What this order may legally become next — the buttons the UI may show. */
  nextStatuses: OrderStatus[];
}

export async function getAdminOrder(
  orderNumber: string,
  locale: Locale,
): Promise<AdminOrderDetail | null> {
  await requireStaff();

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: {
      orderNumber: true,
      status: true,
      placedAt: true,
      fullName: true,
      phone: true,
      governorate: true,
      city: true,
      addressLine: true,
      notes: true,
      cancelReason: true,
      subtotalIqd: true,
      discountIqd: true,
      deliveryIqd: true,
      totalIqd: true,
      payment: { select: { status: true } },
      items: {
        select: {
          productNameAr: true,
          productNameEn: true,
          sku: true,
          variantLabelAr: true,
          variantLabelEn: true,
          unitPriceIqd: true,
          quantity: true,
          lineTotalIqd: true,
        },
      },
      events: {
        select: {
          fromStatus: true,
          toStatus: true,
          note: true,
          createdAt: true,
          // actorId is a column, not a relation, so the name is looked up below.
          actorId: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!order) return null;

  const actorIds = [
    ...new Set(order.events.map((event) => event.actorId).filter((id) => id !== null)),
  ];
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      })
    : [];
  const actorName = new Map(actors.map((actor) => [actor.id, actor.name]));

  const isArabic = locale === 'ar';

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    placedAt: order.placedAt,
    fullName: order.fullName,
    phone: order.phone,
    governorate: order.governorate,
    city: order.city,
    addressLine: order.addressLine,
    notes: order.notes,
    cancelReason: order.cancelReason,
    subtotalIqd: order.subtotalIqd,
    discountIqd: order.discountIqd,
    deliveryIqd: order.deliveryIqd,
    totalIqd: order.totalIqd,
    paymentStatus: order.payment?.status ?? null,
    // The snapshot, not today's catalogue — this is an invoice.
    lines: order.items.map((item) => ({
      name: isArabic ? item.productNameAr : item.productNameEn,
      sku: item.sku,
      variantLabel: isArabic ? item.variantLabelAr : item.variantLabelEn,
      unitPriceIqd: item.unitPriceIqd,
      quantity: item.quantity,
      lineTotalIqd: item.lineTotalIqd,
    })),
    timeline: order.events.map((event) => ({
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: event.note,
      actorName: event.actorId ? (actorName.get(event.actorId) ?? null) : null,
      at: event.createdAt,
    })),
    // Computed from the state machine rather than hard-coded in the page, so
    // the buttons a staff member sees can never offer an illegal move.
    nextStatuses: [...allowedTransitions(order.status)],
  };
}

/** Counts for the dashboard's landing page. */
export async function getAdminOverview() {
  await requireStaff();

  const [pending, processing, outForDelivery, deliveredToday, products, lowStock] =
    await Promise.all([
      db.order.count({ where: { status: OrderStatus.PENDING } }),
      db.order.count({
        where: {
          status: { in: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING] },
        },
      }),
      db.order.count({ where: { status: OrderStatus.OUT_FOR_DELIVERY } }),
      db.order.count({
        where: {
          status: OrderStatus.DELIVERED,
          deliveredAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      db.product.count({ where: { isPublished: true } }),
      // Only meaningful for variants that count units; the rest sell on status.
      db.inventory.count({
        where: { trackQuantity: true, onHand: { lte: 3 } },
      }),
    ]);

  return { pending, processing, outForDelivery, deliveredToday, products, lowStock };
}
