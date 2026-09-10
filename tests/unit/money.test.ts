import { describe, expect, it } from 'vitest';
import {
  applyFixedDiscount,
  applyPercentageDiscount,
  discountPercentage,
  formatIqd,
  MoneyError,
  sumIqd,
} from '@/lib/money';

describe('formatIqd', () => {
  it('renders Latin digits with a grouping separator in both locales', () => {
    expect(formatIqd(1_250_000, 'en')).toBe('1,250,000 IQD');
    expect(formatIqd(1_250_000, 'ar')).toBe('1,250,000 د.ع');
  });

  it('omits the symbol when asked', () => {
    expect(formatIqd(750_000, 'en', { withSymbol: false })).toBe('750,000');
  });

  it('rejects fractional amounts rather than silently rounding', () => {
    expect(() => formatIqd(1000.5, 'en')).toThrow(MoneyError);
  });
});

describe('applyPercentageDiscount', () => {
  it('rounds down so the customer never pays more than the advertised saving', () => {
    // 10% of 1,999,999 is 199,999.9 -> floor to 199,999 off.
    expect(applyPercentageDiscount(1_999_999, 10)).toBe(1_800_000);
  });

  it('handles the boundaries', () => {
    expect(applyPercentageDiscount(500_000, 0)).toBe(500_000);
    expect(applyPercentageDiscount(500_000, 100)).toBe(0);
  });

  it('rejects out-of-range percentages', () => {
    expect(() => applyPercentageDiscount(1000, 101)).toThrow(MoneyError);
    expect(() => applyPercentageDiscount(1000, -1)).toThrow(MoneyError);
  });
});

describe('applyFixedDiscount', () => {
  it('never drives a price below zero', () => {
    expect(applyFixedDiscount(50_000, 80_000)).toBe(0);
  });

  it('rejects a negative discount, which would be a price increase', () => {
    expect(() => applyFixedDiscount(50_000, -5_000)).toThrow(MoneyError);
  });
});

describe('discountPercentage', () => {
  it('computes a whole-percent saving', () => {
    expect(discountPercentage(800_000, 1_000_000)).toBe(20);
  });

  it('returns 0 when there is no genuine discount', () => {
    expect(discountPercentage(1_000_000, null)).toBe(0);
    expect(discountPercentage(1_000_000, 1_000_000)).toBe(0);
    // A "was" price lower than the selling price is not a discount.
    expect(discountPercentage(1_000_000, 900_000)).toBe(0);
  });
});

describe('sumIqd', () => {
  it('adds line totals exactly', () => {
    expect(sumIqd([1_250_000, 750_000, 99_000])).toBe(2_099_000);
  });

  it('rejects a float sneaking into a total', () => {
    expect(() => sumIqd([1000, 0.1])).toThrow(MoneyError);
  });
});
