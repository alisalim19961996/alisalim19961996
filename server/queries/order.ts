import 'server-only';

import type { Governorate, OrderStatus, Prisma } from '@prisma/client';
import { db } from '@/server/db/client';
import { normalizeIraqiPhone } from '@/lib/phone';
import { requireUser } from '@/server/auth/guards';
import type { Locale } from '@/i18n/routing';

/**
 * Order reads for the customer's own screens: the confirmation page and public
 * tracking.
 *
 * Everything here is scoped by something the customer can prove — their phone
 * number, or a session that owns the order. Order numbers are sequential by
 * design, so they are a reference, never a credential.
 */

export interface OrderLineView {
  name: string;
  brandName: string;
  variantLabel: string;
  imageUrl: string | null;
  sku: string;
  unitPriceIqd: number;
  quantity: number;
  lineTotalIqd: number;
}

export interface OrderTimelineEntry {
  status: OrderStatus;
  at: Date;
}

export interface OrderView {
  orderNumber: string;
  status: OrderStatus;
  placedAt: Date;
  fullName: string;
  phone: string;
  governorate: Governorate;
  city: string;
  addressLine: string;
  notes: string | null;
  subtotalIqd: number;
  discountIqd: number;
  deliveryIqd: number;
  totalIqd: number;
  lines: OrderLineView[];
  timeline: OrderTimelineEntry[];
}

const orderSelect = {
  orderNumber: true,
  status: true,
  placedAt: true,
  fullName: true,
  phone: true,
  governorate: true,
  city: true,
  addressLine: true,
  notes: true,
  subtotalIqd: true,
  discountIqd: true,
  deliveryIqd: true,
  totalIqd: true,
  items: {
    select: {
      productNameAr: true,
      productNameEn: true,
      brandName: true,
      variantLabelAr: true,
      variantLabelEn: true,
      imageUrl: true,
      sku: true,
      unitPriceIqd: true,
      quantity: true,
      lineTotalIqd: true,
    },
  },
  events: {
    select: { toStatus: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  },
} as const;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

function toView(order: OrderRow, locale: Locale): OrderView {
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
    subtotalIqd: order.subtotalIqd,
    discountIqd: order.discountIqd,
    deliveryIqd: order.deliveryIqd,
    totalIqd: order.totalIqd,
    // The names here are the ones snapshotted at purchase, not today's
    // catalogue — an invoice must keep saying what was actually bought.
    lines: order.items.map((item) => ({
      name: isArabic ? item.productNameAr : item.productNameEn,
      brandName: item.brandName,
      variantLabel: isArabic ? item.variantLabelAr : item.variantLabelEn,
      imageUrl: item.imageUrl,
      sku: item.sku,
      unitPriceIqd: item.unitPriceIqd,
      quantity: item.quantity,
      lineTotalIqd: item.lineTotalIqd,
    })),
    timeline: order.events.map((event) => ({
      status: event.toStatus,
      at: event.createdAt,
    })),
  };
}

/**
 * Look up an order the way the public tracking form does: number **and** the
 * phone that placed it.
 *
 * The phone is compared in its stored E.164 form, so the customer can type it
 * however they like and still match. A wrong phone returns null — the same
 * answer as a number that does not exist, so this cannot be used to discover
 * which order numbers are real.
 */
export async function findOrderByNumberAndPhone(
  orderNumber: string,
  phone: string,
  locale: Locale,
): Promise<OrderView | null> {
  const normalizedPhone = normalizeIraqiPhone(phone);
  if (!normalizedPhone) return null;

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: orderSelect,
  });

  if (!order || order.phone !== normalizedPhone) return null;
  return toView(order, locale);
}

/**
 * Look up an order for someone who has already proved they own it — they just
 * placed it in this browser, or they are signed in as the buyer.
 *
 * `allowedOrderNumber` comes from an httpOnly cookie written at checkout, so a
 * shared or guessed URL shows nothing.
 */
export async function findOwnedOrder(
  orderNumber: string,
  viewer: { userId: string | null; allowedOrderNumber: string | null },
  locale: Locale,
): Promise<OrderView | null> {
  const justPlaced = viewer.allowedOrderNumber === orderNumber;

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: { ...orderSelect, userId: true },
  });

  if (!order) return null;

  const ownedBySession = Boolean(viewer.userId) && order.userId === viewer.userId;
  if (!justPlaced && !ownedBySession) return null;

  return toView(order, locale);
}

// ---------------------------------------------------------------------------

/** Orders per page in the account area. */
export const ACCOUNT_ORDERS_PER_PAGE = 10;

export interface AccountOrderRow {
  orderNumber: string;
  status: OrderStatus;
  placedAt: Date;
  totalIqd: number;
  itemCount: number;
  /** The first line's image, so a row is recognisable at a glance. */
  imageUrl: string | null;
}

export interface AccountOrdersResult {
  rows: AccountOrderRow[];
  total: number;
  page: number;
  pageCount: number;
}

/**
 * A signed-in customer's own orders.
 *
 * Calls `requireUser()` itself rather than taking a user id from the caller.
 * A function that accepts an id is one mistaken argument away from serving
 * somebody else's address and phone number — and the page above it is not the
 * only possible caller (§7: the guard protects the data, the route only
 * protects the route).
 *
 * Scoped strictly by `userId`. Matching on phone as well would fold in guest
 * orders placed with the same number, which sounds helpful and is not: a phone
 * number is not verified anywhere in MPS, so anyone could register with
 * somebody else's and read their order history.
 */
export async function getMyOrders(page = 1): Promise<AccountOrdersResult> {
  const user = await requireUser();
  const take = ACCOUNT_ORDERS_PER_PAGE;
  const current = Math.max(1, Math.floor(page));

  const where: Prisma.OrderWhereInput = { userId: user.id };

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      skip: (current - 1) * take,
      take,
      select: {
        orderNumber: true,
        status: true,
        placedAt: true,
        totalIqd: true,
        _count: { select: { items: true } },
        items: {
          take: 1,
          orderBy: { id: 'asc' },
          select: { imageUrl: true },
        },
      },
    }),
    db.order.count({ where }),
  ]);

  return {
    rows: orders.map(({ _count, items, ...order }) => ({
      ...order,
      itemCount: _count.items,
      imageUrl: items[0]?.imageUrl ?? null,
    })),
    total,
    page: current,
    pageCount: Math.max(1, Math.ceil(total / take)),
  };
}
