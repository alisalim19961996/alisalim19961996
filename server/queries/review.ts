import 'server-only';

import { ReviewStatus } from '@prisma/client';
import { db } from '@/server/db/client';
import { getCurrentUser } from '@/server/auth/guards';
import {
  averageRating,
  ratingDistribution,
  type RatingBucket,
} from '@/lib/domain/review';

/**
 * Review reads for the storefront.
 *
 * **Only APPROVED reviews leave this module**, and there is no parameter that
 * could ask for anything else — the same shape `server/queries/blog.ts` uses
 * for drafts, and for the same reason: a flag is one wrong argument away from
 * putting unmoderated text on a product page.
 *
 * The moderation queue is a separate module behind `requireStaff()`.
 */

export interface ProductReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  isVerifiedPurchase: boolean;
  createdAt: Date;
  /** The reviewer's display name. Never their email — the page is public. */
  authorName: string;
}

export interface ReviewSummary {
  average: number | null;
  count: number;
  buckets: RatingBucket[];
}

export async function getProductReviews(productId: string): Promise<ProductReview[]> {
  const rows = await db.review.findMany({
    where: { productId, status: ReviewStatus.APPROVED },
    select: {
      id: true,
      rating: true,
      titleAr: true,
      body: true,
      isVerifiedPurchase: true,
      createdAt: true,
      user: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    // A page of reviews, not all of them. A product with four hundred would
    // otherwise put four hundred into the HTML of a prerendered page.
    take: 20,
  });

  return rows.map((row) => ({
    id: row.id,
    rating: row.rating,
    title: row.titleAr,
    body: row.body,
    isVerifiedPurchase: row.isVerifiedPurchase,
    createdAt: row.createdAt,
    authorName: row.user.name,
  }));
}

/**
 * The average, the count and the 5-to-1 breakdown.
 *
 * The average and count come from the denormalised columns on `Product`, which
 * is what the catalogue would read if it ever showed stars; the breakdown is a
 * `groupBy`, because storing five more counters to avoid one grouped count
 * would be five more things to keep in step.
 */
export async function getReviewSummary(productId: string): Promise<ReviewSummary> {
  const [product, grouped] = await Promise.all([
    db.product.findUnique({
      where: { id: productId },
      select: { ratingSum: true, ratingCount: true },
    }),
    db.review.groupBy({
      by: ['rating'],
      where: { productId, status: ReviewStatus.APPROVED },
      _count: { rating: true },
    }),
  ]);

  const counts: Record<number, number> = {};
  for (const row of grouped) counts[row.rating] = row._count.rating;

  const { buckets } = ratingDistribution(counts);

  return {
    average: averageRating(product?.ratingSum ?? 0, product?.ratingCount ?? 0),
    count: product?.ratingCount ?? 0,
    buckets,
  };
}

/**
 * Whether this account has actually received this product.
 *
 * **One copy, used by both the page and the service**, and it was two until a
 * deliberate break went unnoticed: the query decides what to RENDER and the
 * service decides what to ACCEPT, and with a rule written twice, loosening the
 * service's copy left the page still saying no while the write went through.
 * The test that was meant to catch it passed, because it only ever exercised
 * the other copy (§13.16).
 *
 * The join is the interesting part. `OrderItem` snapshots a name and a SKU but
 * carries no productId of its own, so the only link back to the product is
 * through the variant — order → items → variant → product.
 */
export async function hasDeliveredOrderFor(
  userId: string,
  productId: string,
): Promise<boolean> {
  const delivered = await db.order.count({
    where: {
      userId,
      status: 'DELIVERED',
      items: { some: { variant: { productId } } },
    },
  });

  return delivered > 0;
}

/**
 * Whether the signed-in customer may write about this product, and why not.
 *
 * Read rather than thrown, because this decides what the page RENDERS: a form,
 * a line saying the review is waiting to be approved, or a line saying a
 * review is for people who bought the thing. An exception would make all three
 * look the same.
 */
export type ReviewEligibility =
  | { can: true }
  | { can: false; reason: 'signedOut' | 'notPurchased' | 'alreadyReviewed' }
  | { can: false; reason: 'pending' | 'rejected' };

export async function getReviewEligibility(
  productId: string,
): Promise<ReviewEligibility> {
  const user = await getCurrentUser();
  if (!user) return { can: false, reason: 'signedOut' };

  const [existing, delivered] = await Promise.all([
    db.review.findUnique({
      where: { productId_userId: { productId, userId: user.id } },
      select: { status: true },
    }),
    hasDeliveredOrderFor(user.id, productId),
  ]);

  if (existing) {
    if (existing.status === ReviewStatus.APPROVED) {
      return { can: false, reason: 'alreadyReviewed' };
    }
    return {
      can: false,
      reason: existing.status === ReviewStatus.PENDING ? 'pending' : 'rejected',
    };
  }

  if (!delivered) return { can: false, reason: 'notPurchased' };

  return { can: true };
}
