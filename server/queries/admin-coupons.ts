import 'server-only';

import { db } from '@/server/db/client';
import { requireStaff } from '@/server/auth/guards';
import type { CouponFormInput } from '@/schemas/coupon';

/**
 * Reading coupons, for the dashboard.
 *
 * The usage count is not a detail here, it is the column the owner decides
 * from: a code they cannot see the use of is a code they cannot judge. It is
 * shown against the limit for the same reason — "43" means nothing, "43 of 50"
 * means the campaign is nearly over.
 */

export interface CouponRow {
  id: string;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  usageCount: number;
  usageLimit: number | null;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
}

export async function getAdminCoupons(): Promise<CouponRow[]> {
  await requireStaff();

  return db.coupon.findMany({
    select: {
      id: true,
      code: true,
      discountType: true,
      discountValue: true,
      usageCount: true,
      usageLimit: true,
      startsAt: true,
      endsAt: true,
      isActive: true,
    },
    orderBy: [{ isActive: 'desc' }, { endsAt: 'desc' }],
  });
}

export interface CouponFormValues extends CouponFormInput {
  id: string;
  /** How many orders have used it. Shown, never edited. */
  usageCount: number;
}

export async function getCouponForEdit(id: string): Promise<CouponFormValues | null> {
  await requireStaff();

  const coupon = await db.coupon.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
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

  return coupon;
}
