import type { Locale } from '@/i18n/routing';

/**
 * Money in MPS is always a whole number of Iraqi dinars.
 *
 * Iraq does not transact in fils, so there is no minor unit to represent and no
 * reason to involve floating point anywhere in the pricing path. Every helper
 * here takes and returns integers; a non-integer input is a bug, not a value to
 * silently round.
 */

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function assertWholeDinars(value: number, label = 'amount'): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be a whole number of IQD, got ${value}`);
  }
  if (!Number.isFinite(value)) {
    throw new MoneyError(`${label} must be finite, got ${value}`);
  }
}

/** Format a price for display, e.g. "1,250,000 IQD" / "1,250,000 د.ع". */
export function formatIqd(
  amount: number,
  locale: Locale,
  options: { withSymbol?: boolean } = {},
): string {
  assertWholeDinars(amount, 'price');
  const { withSymbol = true } = options;

  // Latin digits in both locales: that is how prices are written in Iraqi
  // commerce, and it keeps numerals unambiguous next to Arabic text.
  const formatted = new Intl.NumberFormat(
    locale === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-US',
    { maximumFractionDigits: 0 },
  ).format(amount);

  if (!withSymbol) return formatted;
  return locale === 'ar' ? `${formatted} د.ع` : `${formatted} IQD`;
}

/**
 * Apply a percentage discount, rounding DOWN so the displayed saving is never
 * smaller than what the customer actually receives.
 */
export function applyPercentageDiscount(amount: number, percentage: number): number {
  assertWholeDinars(amount);
  if (percentage < 0 || percentage > 100) {
    throw new MoneyError(`percentage must be between 0 and 100, got ${percentage}`);
  }
  return amount - Math.floor((amount * percentage) / 100);
}

/** Apply a fixed discount, never taking the price below zero. */
export function applyFixedDiscount(amount: number, discount: number): number {
  assertWholeDinars(amount);
  assertWholeDinars(discount, 'discount');
  if (discount < 0) {
    throw new MoneyError(`discount cannot be negative, got ${discount}`);
  }
  return Math.max(0, amount - discount);
}

/** Whole-percent saving, rounded down; 0 when there is no genuine discount. */
export function discountPercentage(
  priceIqd: number,
  comparePriceIqd: number | null | undefined,
): number {
  if (comparePriceIqd == null) return 0;
  assertWholeDinars(priceIqd, 'price');
  assertWholeDinars(comparePriceIqd, 'comparePrice');
  if (comparePriceIqd <= priceIqd) return 0;
  return Math.floor(((comparePriceIqd - priceIqd) / comparePriceIqd) * 100);
}

/** Sum line totals. Kept here so totalling never drifts into ad-hoc reduces. */
export function sumIqd(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => {
    assertWholeDinars(amount);
    return total + amount;
  }, 0);
}
