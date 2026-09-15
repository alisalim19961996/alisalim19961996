import 'server-only';

import { db } from '@/server/db/client';
import { uniqueConstraintName } from '@/server/db/diagnose';
import { requireStaff } from '@/server/auth/guards';
import type { CouponFormInput } from '@/schemas/coupon';

/**
 * Writing coupons.
 *
 * `usageCount` is never written here. It belongs to the order transaction,
 * which increments it with a conditional UPDATE so two checkouts cannot both
 * take the last use (`server/services/order.ts`). An admin form that could set
 * it would be a second writer racing the first.
 *
 * Deleting is refused once a code has been used, and that is not politeness:
 * `CouponUsage.couponId` cascades, so the delete would take the record of
 * every order that used the code with it — and those orders keep their
 * `discountIqd`, so the money would still be missing from the books with
 * nothing left to explain it. Deactivating is the reversible answer.
 */

export type CouponErrorCode = 'notFound' | 'codeTaken' | 'couponUsed' | 'saveFailed';

export class CouponError extends Error {
  constructor(
    message: string,
    /** Key under the `admin` namespace in messages/, so the UI can translate it. */
    readonly code: CouponErrorCode,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'CouponError';
  }
}

function translateWriteError(error: unknown): Error {
  if (uniqueConstraintName(error)) {
    return new CouponError('code already taken', 'codeTaken', 'code');
  }
  return error instanceof Error ? error : new CouponError('save failed', 'saveFailed');
}

export interface SaveCouponResult {
  id: string;
}

export async function saveCoupon(
  input: CouponFormInput,
  id?: string,
): Promise<SaveCouponResult> {
  await requireStaff();

  const data = {
    code: input.code,
    discountType: input.discountType,
    discountValue: input.discountValue,
    minOrderIqd: input.minOrderIqd,
    maxDiscountIqd: input.maxDiscountIqd,
    usageLimit: input.usageLimit,
    perUserLimit: input.perUserLimit,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    isActive: input.isActive,
  };

  try {
    if (!id) {
      const created = await db.coupon.create({ data, select: { id: true } });
      return { id: created.id };
    }

    const existing = await db.coupon.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new CouponError('coupon not found', 'notFound');

    await db.coupon.update({ where: { id }, data });
    return { id };
  } catch (error) {
    throw translateWriteError(error);
  }
}

export async function setCouponActive(id: string, isActive: boolean): Promise<void> {
  await requireStaff();

  const coupon = await db.coupon.findUnique({ where: { id }, select: { id: true } });
  if (!coupon) throw new CouponError('coupon not found', 'notFound');

  await db.coupon.update({ where: { id }, data: { isActive } });
}

export async function deleteCoupon(id: string): Promise<void> {
  await requireStaff();

  const coupon = await db.coupon.findUnique({
    where: { id },
    select: { _count: { select: { usages: true } } },
  });
  if (!coupon) throw new CouponError('coupon not found', 'notFound');

  if (coupon._count.usages > 0) {
    // Counted first, and refused with the number, because Postgres would
    // cascade rather than refuse — quietly erasing the record of which orders
    // were discounted while the discounts themselves stay on the orders.
    throw new CouponError(
      `coupon used by ${coupon._count.usages} orders`,
      'couponUsed',
      String(coupon._count.usages),
    );
  }

  await db.coupon.delete({ where: { id } });
}
