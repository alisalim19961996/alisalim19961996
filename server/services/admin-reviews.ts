import 'server-only';

import { ReviewStatus } from '@prisma/client';
import { db } from '@/server/db/client';
import { requireStaff } from '@/server/auth/guards';
import { recomputeProductRating } from './review';

/**
 * Moderating reviews.
 *
 * Two things happen together or not at all: the review's status changes, and
 * the product's rating columns are recomputed from what is APPROVED. Outside a
 * transaction, a crash between them leaves a product claiming an average
 * nobody gave — and nothing would ever say when it drifted, because the
 * columns are only ever written here.
 *
 * Who moderated and when are recorded because this is the one screen where
 * staff decide what a customer's words are worth, and "the review disappeared"
 * is not an answer anybody can check.
 */

export class AdminReviewError extends Error {
  constructor(
    message: string,
    /** Key under the `admin` namespace in messages/, so the UI can translate it. */
    /*
      Its own code, not the shared `notFound`: that key already reads "we
      could not find the order" in the admin namespace, and a moderator
      would be told about an order they were not looking at.
    */
    readonly code: 'reviewNotFound',
  ) {
    super(message);
    this.name = 'AdminReviewError';
  }
}

export async function moderateReview(
  reviewId: string,
  approve: boolean,
): Promise<void> {
  const staff = await requireStaff();

  await db.$transaction(async (tx) => {
    const review = await tx.review.findUnique({
      where: { id: reviewId },
      select: { id: true, productId: true },
    });

    if (!review) throw new AdminReviewError(`no review ${reviewId}`, 'reviewNotFound');

    await tx.review.update({
      where: { id: reviewId },
      data: {
        status: approve ? ReviewStatus.APPROVED : ReviewStatus.REJECTED,
        moderatedById: staff.id,
        moderatedAt: new Date(),
      },
    });

    // Recomputed on a rejection too: rejecting a review that was previously
    // approved has to take its stars back out of the average.
    await recomputeProductRating(tx, review.productId);
  });
}

/**
 * Delete a review outright.
 *
 * Rejecting hides it and keeps the record of the decision, which is almost
 * always what is wanted. Deleting exists for the case rejecting cannot cover:
 * text that should not be stored at all — a phone number, an address, abuse
 * aimed at a person. Nothing points at a `Review`, so this is a real delete.
 */
export async function deleteReview(reviewId: string): Promise<void> {
  await requireStaff();

  await db.$transaction(async (tx) => {
    const review = await tx.review.findUnique({
      where: { id: reviewId },
      select: { productId: true },
    });

    if (!review) throw new AdminReviewError(`no review ${reviewId}`, 'reviewNotFound');

    await tx.review.delete({ where: { id: reviewId } });
    await recomputeProductRating(tx, review.productId);
  });
}
