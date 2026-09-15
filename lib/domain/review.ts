/**
 * What a rating means, and how a pile of them is summarised.
 *
 * Pure, and framework-free, so the arithmetic that decides what number sits
 * under a product's name can be unit-tested (§17). Everything about WHO may
 * write one lives in the service, because it needs the database.
 */

export const MIN_RATING = 1;
export const MAX_RATING = 5;

/** The five buckets, high to low — the order a distribution is read in. */
export const RATING_VALUES = [5, 4, 3, 2, 1] as const;

export function isValidRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= MIN_RATING && rating <= MAX_RATING;
}

/**
 * The average, to one decimal place, or null when there is nothing to average.
 *
 * Null rather than 0, and the distinction is the whole point: a product with no
 * reviews has no rating, while 0 is a rating nobody can give. Rendering "0.0"
 * beside a new product would be a claim the shop invented (§13.12).
 *
 * Computed from the stored sum and count rather than from a stored average:
 * the columns are exact integers, so this is the only place a rounding
 * decision is made, and it is made where the number is shown.
 */
export function averageRating(sum: number, count: number): number | null {
  if (count <= 0) return null;
  // Rounded, not truncated: 4.45 reads as 4.5 the way a shopper expects, and
  // truncating would make a product of nothing but 5s and 4s look worse than
  // its arithmetic.
  return Math.round((sum / count) * 10) / 10;
}

/**
 * How full each of the five stars is, for a given average.
 *
 * Returned as hundredths rather than as a float per star so the UI can express
 * a partial star as a width without repeating this arithmetic — and so the
 * rounding lives here, where it is tested.
 */
export function starFill(average: number | null): number[] {
  if (average === null) return [0, 0, 0, 0, 0];

  const clamped = Math.max(0, Math.min(MAX_RATING, average));
  return Array.from({ length: MAX_RATING }, (_, index) => {
    const remaining = clamped - index;
    if (remaining >= 1) return 100;
    if (remaining <= 0) return 0;
    return Math.round(remaining * 100);
  });
}

export interface RatingBucket {
  rating: number;
  count: number;
  /** Share of all reviews, 0–100, rounded — for the bar beside each row. */
  percent: number;
}

/**
 * The 5-to-1 breakdown, with every bucket present.
 *
 * Buckets with no reviews are kept rather than dropped: a distribution missing
 * its "1 star" row reads as a shop hiding one, and an empty row is the honest
 * way to say nobody gave it.
 */
export function ratingDistribution(counts: Readonly<Record<number, number>>): {
  buckets: RatingBucket[];
  total: number;
} {
  const total = RATING_VALUES.reduce((sum, rating) => sum + (counts[rating] ?? 0), 0);

  const buckets = RATING_VALUES.map((rating) => {
    const count = counts[rating] ?? 0;
    return {
      rating,
      count,
      percent: total === 0 ? 0 : Math.round((count / total) * 100),
    };
  });

  return { buckets, total };
}
