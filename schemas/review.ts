import { z } from 'zod';
import { MAX_RATING, MIN_RATING } from '@/lib/domain/review';

/**
 * What a customer is allowed to say about a product.
 *
 * A rating, a body, and an optional title. Not the status — a review arrives
 * PENDING and only a moderator changes that — and not the product's own
 * identity beyond its id, which the service checks against an order the
 * customer actually received.
 */

const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/i, 'invalid id');

export const reviewFormSchema = z.object({
  productId: id,
  rating: z.coerce
    .number()
    .int('notWhole')
    .min(MIN_RATING, 'ratingRequired')
    .max(MAX_RATING),
  /**
   * Optional, and empty means absent.
   *
   * Stored in `Review.titleAr` — a column named before the store had an
   * English half, and kept rather than migrated: a customer writes one title
   * in their own language, so a second column would always be empty.
   */
  title: z
    .string()
    .trim()
    .max(120, 'tooLong')
    .optional()
    .transform((value) => (value ? value : null)),
  /**
   * A floor as well as a ceiling. "جيد" is not a review anybody can act on,
   * and a one-word body is what a review farm produces in bulk.
   */
  body: z.string().trim().min(10, 'bodyTooShort').max(2000, 'tooLong'),
});

export type ReviewFormInput = z.infer<typeof reviewFormSchema>;

export const moderateReviewSchema = z.object({
  reviewId: id,
  approve: z.boolean(),
});
