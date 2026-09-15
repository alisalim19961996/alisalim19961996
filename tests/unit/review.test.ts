import { describe, expect, it } from 'vitest';
import {
  MAX_RATING,
  RATING_VALUES,
  averageRating,
  isValidRating,
  ratingDistribution,
  starFill,
} from '@/lib/domain/review';

/**
 * The arithmetic behind the number under a product's name.
 *
 * Worth pinning because every one of these values is a commercial claim: a
 * rating rounded the wrong way, or a "0.0" on a product nobody has reviewed,
 * is the shop saying something about its own goods that is not true (§13.12).
 */

describe('isValidRating', () => {
  it('accepts the five a customer can give', () => {
    for (const rating of RATING_VALUES) expect(isValidRating(rating)).toBe(true);
  });

  it('refuses everything else', () => {
    // 0 is the interesting one: it is what an unfilled form sends, and it is
    // not a rating anybody can leave.
    for (const rating of [0, -1, 6, 4.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidRating(rating), `${rating} was accepted`).toBe(false);
    }
  });
});

describe('averageRating', () => {
  it('is null with nothing to average, never zero', () => {
    // 0.0 under a new product is a rating nobody gave. Null is "no rating".
    expect(averageRating(0, 0)).toBeNull();
    expect(averageRating(0, -1)).toBeNull();
  });

  it('averages to one decimal place', () => {
    expect(averageRating(5, 1)).toBe(5);
    expect(averageRating(9, 2)).toBe(4.5);
    expect(averageRating(14, 3)).toBe(4.7);
  });

  it('rounds rather than truncating', () => {
    // 4.45 → 4.5. Truncating would make a product of 5s and 4s read worse than
    // its own arithmetic.
    expect(averageRating(89, 20)).toBe(4.5);
  });

  it('never invents precision the ratings do not have', () => {
    expect(averageRating(10, 3)).toBe(3.3);
    expect(averageRating(11, 3)).toBe(3.7);
  });
});

describe('starFill', () => {
  it('is five empty stars when there is no rating', () => {
    expect(starFill(null)).toEqual([0, 0, 0, 0, 0]);
  });

  it('fills whole stars', () => {
    expect(starFill(5)).toEqual([100, 100, 100, 100, 100]);
    expect(starFill(3)).toEqual([100, 100, 100, 0, 0]);
  });

  it('fills the partial star and nothing after it', () => {
    expect(starFill(3.5)).toEqual([100, 100, 100, 50, 0]);
    expect(starFill(4.2)).toEqual([100, 100, 100, 100, 20]);
  });

  it('clamps a value that cannot happen rather than overflowing', () => {
    // The CHECK constraints make this unreachable; a component drawing six
    // stars because the arithmetic drifted is a worse failure than a clamp.
    expect(starFill(9)).toEqual([100, 100, 100, 100, 100]);
    expect(starFill(-2)).toEqual([0, 0, 0, 0, 0]);
  });

  it('always returns one entry per star', () => {
    expect(starFill(2.7)).toHaveLength(MAX_RATING);
  });
});

describe('ratingDistribution', () => {
  it('keeps every bucket, including the empty ones', () => {
    // A breakdown missing its "1 star" row reads as a shop hiding one.
    const { buckets, total } = ratingDistribution({ 5: 3, 4: 1 });

    expect(buckets.map((bucket) => bucket.rating)).toEqual([5, 4, 3, 2, 1]);
    expect(total).toBe(4);
    expect(buckets.map((bucket) => bucket.count)).toEqual([3, 1, 0, 0, 0]);
  });

  it('is all zeroes rather than a division by zero when there is nothing', () => {
    const { buckets, total } = ratingDistribution({});
    expect(total).toBe(0);
    expect(buckets.every((bucket) => bucket.percent === 0)).toBe(true);
  });

  it('gives each bucket its share', () => {
    const { buckets } = ratingDistribution({ 5: 1, 4: 1, 3: 1, 2: 1 });
    expect(buckets.map((bucket) => bucket.percent)).toEqual([25, 25, 25, 25, 0]);
  });

  it('ignores a rating outside the five', () => {
    // Unreachable through the form and refused by the database; counted here
    // it would make every percentage wrong without anything looking broken.
    const { total } = ratingDistribution({ 5: 2, 7: 99 } as Record<number, number>);
    expect(total).toBe(2);
  });
});
