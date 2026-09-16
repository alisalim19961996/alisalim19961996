import 'server-only';

import type { Governorate, OrderStatus, Prisma } from '@prisma/client';
import { db } from '@/server/db/client';
import { normalizeIraqiPhone } from '@/lib/phone';
import { hashOrderGrant, isOrderGrantShape } from '@/lib/domain/order-grant';
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
 * Identify an order the way the public tracking form does: number **and** the
 * phone that placed it.
 *
 * Returns the row id, not a view, because that is all the caller needs: the
 * tracking action turns this into a grant and redirects to the order page,
 * which renders it through `findOwnedOrder` like any other visit. Building a
 * view here as well would be a second copy of "who may see this order", and
 * §12 already records what a second copy of an access rule costs.
 *
 * The phone is compared in its stored E.164 form, so the customer can type it
 * however they like and still match. A wrong phone returns null — the same
 * answer as a number that does not exist, so this cannot be used to discover
 * which order numbers are real.
 */
export async function identifyOrderByNumberAndPhone(
  orderNumber: string,
  phone: string,
): Promise<{ id: string; orderNumber: string } | null> {
  const normalizedPhone = normalizeIraqiPhone(phone);
  if (!normalizedPhone) return null;

  return db.order.findFirst({
    where: { orderNumber, phone: normalizedPhone },
    select: { id: true, orderNumber: true },
  });
}

/**
 * Look up an order for someone who has already proved they own it — they hold
 * the grant issued to the browser that placed it, or they are signed in as the
 * buyer.
 *
 * `grant` is the raw value of the `mps.order_grant` cookie. It is **hashed and
 * matched in SQL**, never compared in JavaScript against a row fetched first:
 * the query either finds an order whose stored hash equals this one and whose
 * expiry is still ahead, or it finds nothing. That keeps the unauthorised
 * answer identical to the answer for an order number that does not exist, and
 * leaves no string comparison to time.
 *
 * What this replaces mattered. The cookie used to hold the order NUMBER, and
 * `allowedOrderNumber === orderNumber` was the whole check. `httpOnly` stops
 * JavaScript reading a cookie; it does not stop a client setting one — and the
 * numbers are sequential by design, so anybody could walk a day's four digits
 * and read back each customer's name, phone and home address.
 */
export async function findOwnedOrder(
  orderNumber: string,
  viewer: { userId: string | null; grant: string | null },
  locale: Locale,
): Promise<OrderView | null> {
  // Two separate reads rather than one OR, so neither half can widen the
  // other: the session read is scoped by userId, the guest read by the hash.
  if (viewer.userId) {
    const owned = await db.order.findFirst({
      where: { orderNumber, userId: viewer.userId },
      select: orderSelect,
    });
    if (owned) return toView(owned, locale);
  }

  if (!isOrderGrantShape(viewer.grant)) return null;

  const granted = await db.order.findFirst({
    where: {
      orderNumber,
      guestAccessHash: hashOrderGrant(viewer.grant),
      guestAccessExpiresAt: { gt: new Date() },
    },
    select: orderSelect,
  });

  return granted ? toView(granted, locale) : null;
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
