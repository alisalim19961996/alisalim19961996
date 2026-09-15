/**
 * What a discount code is worth, and every reason it is refused.
 *
 * Pure, and takes the clock as an argument, because a coupon is mostly dates
 * and counters: a rule that reads `new Date()` itself answers differently on
 * every run and cannot be pinned by a test. The service passes the real clock;
 * the tests pass one they control.
 *
 * The client never sends an amount — only the code (§13.7). This is the only
 * place that decides what the code is worth, and `server/services/order.ts`
 * calls it again inside the transaction that writes the order, so what the
 * customer was quoted and what they are charged come from the same function.
 */

export type DiscountType = 'PERCENTAGE' | 'FIXED';

/**
 * Why a code did not apply. Keys under the `checkout` namespace, never
 * sentences.
 *
 * `couponInvalid` deliberately covers a code that does not exist, one that is
 * switched off, and one outside its dates. Telling a visitor which of those it
 * is turns the box into a way to discover the shop's codes and when they run —
 * the same reasoning as the single sign-in error and the tracking form (§12).
 * The refusals a customer can act on are the ones that name a condition of
 * their own order: too small, or already used.
 */
export type CouponRefusal =
  'couponInvalid' | 'couponExhausted' | 'couponAlreadyUsed' | 'couponMinOrder';

export interface CouponRules {
  discountType: DiscountType;
  /** Percent (1–100) or a whole-IQD amount, depending on `discountType`. */
  discountValue: number;
  minOrderIqd: number;
  maxDiscountIqd: number | null;
  /** null means unlimited. */
  usageLimit: number | null;
  usageCount: number;
  perUserLimit: number;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
}

export interface CouponContext {
  subtotalIqd: number;
  now: Date;
  /**
   * How many times this account has used the code, or **null for a guest**.
   *
   * Null means the per-user limit cannot be enforced: `CouponUsage.userId` is
   * the only identity a usage row carries, and a guest checkout has none. The
   * global `usageLimit` still applies, which is the control that actually
   * bounds the cost. Documented rather than faked — keying it on a phone
   * number would be a new column and a claim that phone numbers are accounts.
   */
  usedByThisUser: number | null;
}

export type CouponEvaluation =
  { ok: true; discountIqd: number } | { ok: false; reason: CouponRefusal };

/**
 * The discount itself, before any of the rules about who may use it.
 *
 * Percentage rounds **down**, matching `applyPercentageDiscount` in
 * `lib/money.ts`: money here is whole dinars, and the alternative is a shop
 * that occasionally gives a dinar it did not advertise.
 *
 * Two ceilings, both of which must hold: `maxDiscountIqd` is the owner's cap
 * on a percentage code, and the subtotal is the arithmetic one — a discount
 * larger than the goods would make `orderTotals` throw and, worse, would have
 * the shop paying towards delivery.
 */
export function couponDiscount(
  rules: Pick<CouponRules, 'discountType' | 'discountValue' | 'maxDiscountIqd'>,
  subtotalIqd: number,
): number {
  const raw =
    rules.discountType === 'PERCENTAGE'
      ? Math.floor((subtotalIqd * rules.discountValue) / 100)
      : rules.discountValue;

  const capped =
    rules.maxDiscountIqd == null ? raw : Math.min(raw, rules.maxDiscountIqd);
  return Math.max(0, Math.min(capped, subtotalIqd));
}

export function evaluateCoupon(
  rules: CouponRules,
  context: CouponContext,
): CouponEvaluation {
  const time = context.now.getTime();

  // Switched off, not started, finished — one answer, on purpose.
  if (
    !rules.isActive ||
    time < rules.startsAt.getTime() ||
    time > rules.endsAt.getTime()
  ) {
    return { ok: false, reason: 'couponInvalid' };
  }

  if (rules.usageLimit != null && rules.usageCount >= rules.usageLimit) {
    return { ok: false, reason: 'couponExhausted' };
  }

  // Only when there is an account to count against. See `usedByThisUser`.
  if (context.usedByThisUser != null && context.usedByThisUser >= rules.perUserLimit) {
    return { ok: false, reason: 'couponAlreadyUsed' };
  }

  if (context.subtotalIqd < rules.minOrderIqd) {
    return { ok: false, reason: 'couponMinOrder' };
  }

  const discountIqd = couponDiscount(rules, context.subtotalIqd);

  // A code that works out to nothing is refused rather than applied: showing
  // "discount: 0" beside an unchanged total reads as the shop being broken.
  if (discountIqd <= 0) return { ok: false, reason: 'couponInvalid' };

  return { ok: true, discountIqd };
}

/** Codes are typed by people: compared upper-case, without surrounding space. */
export function normaliseCouponCode(input: string): string {
  return input.trim().toUpperCase();
}
