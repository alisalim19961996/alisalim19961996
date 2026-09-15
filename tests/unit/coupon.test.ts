import { describe, expect, it } from 'vitest';
import {
  couponDiscount,
  evaluateCoupon,
  normaliseCouponCode,
  type CouponRules,
} from '@/lib/domain/coupon';

const NOW = new Date('2026-09-15T12:00:00Z');

const BASE: CouponRules = {
  discountType: 'PERCENTAGE',
  discountValue: 10,
  minOrderIqd: 0,
  maxDiscountIqd: null,
  usageLimit: null,
  usageCount: 0,
  perUserLimit: 1,
  startsAt: new Date('2026-09-01T00:00:00Z'),
  endsAt: new Date('2026-12-31T00:00:00Z'),
  isActive: true,
};

const context = (subtotalIqd: number, usedByThisUser: number | null = 0) => ({
  subtotalIqd,
  now: NOW,
  usedByThisUser,
});

describe('couponDiscount', () => {
  it('rounds a percentage down, like the rest of the money code', () => {
    // 10% of 68,005 is 6,800.5. Whole dinars only, and never a dinar the shop
    // did not advertise.
    expect(couponDiscount({ ...BASE }, 68_005)).toBe(6_800);
  });

  it('takes a fixed amount as given', () => {
    expect(
      couponDiscount(
        { discountType: 'FIXED', discountValue: 5_000, maxDiscountIqd: null },
        68_000,
      ),
    ).toBe(5_000);
  });

  it('honours the owner’s cap on a percentage code', () => {
    expect(
      couponDiscount(
        { discountType: 'PERCENTAGE', discountValue: 50, maxDiscountIqd: 20_000 },
        500_000,
      ),
    ).toBe(20_000);
  });

  it('never exceeds the subtotal', () => {
    // Otherwise `orderTotals` throws, and worse: the shop would be paying
    // towards the delivery fee.
    expect(
      couponDiscount(
        { discountType: 'FIXED', discountValue: 100_000, maxDiscountIqd: null },
        68_000,
      ),
    ).toBe(68_000);
    expect(
      couponDiscount(
        { discountType: 'PERCENTAGE', discountValue: 100, maxDiscountIqd: null },
        68_000,
      ),
    ).toBe(68_000);
  });
});

describe('evaluateCoupon', () => {
  it('applies a good code', () => {
    expect(evaluateCoupon(BASE, context(100_000))).toEqual({
      ok: true,
      discountIqd: 10_000,
    });
  });

  it.each([
    ['switched off', { isActive: false }],
    ['not started', { startsAt: new Date('2026-10-01T00:00:00Z') }],
    ['finished', { endsAt: new Date('2026-09-01T00:00:00Z') }],
  ])('answers the same for a code that is %s', (_label, overrides) => {
    // One answer for all three, deliberately: distinguishing them turns the box
    // into a way to discover the shop's codes and when they run.
    expect(evaluateCoupon({ ...BASE, ...overrides }, context(100_000))).toEqual({
      ok: false,
      reason: 'couponInvalid',
    });
  });

  it('refuses one that has been used up', () => {
    expect(
      evaluateCoupon({ ...BASE, usageLimit: 5, usageCount: 5 }, context(100_000)),
    ).toEqual({ ok: false, reason: 'couponExhausted' });
  });

  it('refuses a second use by the same account', () => {
    expect(evaluateCoupon(BASE, context(100_000, 1))).toEqual({
      ok: false,
      reason: 'couponAlreadyUsed',
    });
  });

  it('cannot enforce the per-user limit for a guest, and says so by allowing it', () => {
    // A guest checkout has no account to count against — CouponUsage.userId is
    // the only identity a usage row carries. The global limit still binds.
    expect(evaluateCoupon(BASE, context(100_000, null))).toEqual({
      ok: true,
      discountIqd: 10_000,
    });
  });

  it('refuses an order below the minimum', () => {
    expect(evaluateCoupon({ ...BASE, minOrderIqd: 200_000 }, context(100_000))).toEqual(
      { ok: false, reason: 'couponMinOrder' },
    );
  });

  it('refuses a code that works out to nothing', () => {
    // "Discount: 0" beside an unchanged total reads as the shop being broken.
    expect(
      evaluateCoupon(
        { ...BASE, discountType: 'PERCENTAGE', discountValue: 1 },
        context(50),
      ),
    ).toEqual({ ok: false, reason: 'couponInvalid' });
  });

  it('checks the limits before the minimum', () => {
    // An exhausted code is exhausted whatever the basket is worth; telling the
    // customer to spend more first would be a lie.
    expect(
      evaluateCoupon(
        { ...BASE, usageLimit: 1, usageCount: 1, minOrderIqd: 999_999 },
        context(100_000),
      ),
    ).toEqual({ ok: false, reason: 'couponExhausted' });
  });
});

describe('normaliseCouponCode', () => {
  it('is what people actually type', () => {
    expect(normaliseCouponCode('  eid2026 ')).toBe('EID2026');
  });
});
