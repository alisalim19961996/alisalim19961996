import 'server-only';

import { Prisma, ReviewStatus } from '@prisma/client';
import { db, type DbTransaction } from '@/server/db/client';
import { requireUser } from '@/server/auth/guards';
import { hasDeliveredOrderFor } from '@/server/queries/review';
import { isValidRating } from '@/lib/domain/review';
import type { ReviewFormInput } from '@/schemas/review';

/**
 * Writing a review.
 *
 * **Only a customer with a DELIVERED order for the product may write one**, and
 * that is the decision this whole feature turns on. The alternative — anybody
 * with an account, with `isVerifiedPurchase` as a badge — is what the schema's
 * own comment anticipated, and it is the wrong trade for this shop: email
 * verification is off (§7), so an account costs nothing to create, and a
 * competitor with ten of them can fill the moderation queue faster than one
 * person can read it. Requiring delivery makes every review genuine by
 * construction and bounds the queue by actual sales.
 *
 * `isVerifiedPurchase` is still written, and still true every time, for the
 * reason `Inventory.trackQuantity` exists: the other rule can be switched on
 * later without a migration, and both paths already work. It is not decoration
 * — it is the column that stops that change being a schema change.
 *
 * A review arrives **PENDING**. Nothing a customer types reaches a product page
 * until a human has read it.
 */

export class ReviewError extends Error {
  constructor(
    message: string,
    /** Key under the `review` namespace in messages/, so the UI can translate it. */
    readonly code:
      'productNotFound' | 'notPurchased' | 'alreadyReviewed' | 'invalidRating',
  ) {
    super(message);
    this.name = 'ReviewError';
  }
}

/**
 * Recompute a product's rating columns from its APPROVED reviews.
 *
 * Reads and writes inside the caller's transaction, so the aggregate and the
 * review that changed it move together — a crash between them would leave a
 * product claiming an average nobody gave.
 *
 * Recomputed from the rows rather than adjusted by a delta: a delta is right
 * until one is applied twice, and then the number is wrong forever with
 * nothing to say when it drifted. The CHECK constraints added with this
 * feature refuse an impossible result either way.
 */
export async function recomputeProductRating(
  // `DbTransaction`, not Prisma's own `TransactionClient`: `$extends`
  // produces a distinct client type, so the stock one no longer describes
  // what `db.$transaction` hands a callback (server/db/client.ts).
  tx: DbTransaction,
  productId: string,
): Promise<void> {
  const totals = await tx.review.aggregate({
    where: { productId, status: ReviewStatus.APPROVED },
    _count: { rating: true },
    _sum: { rating: true },
  });

  await tx.product.update({
    where: { id: productId },
    data: {
      ratingCount: totals._count.rating,
      ratingSum: totals._sum.rating ?? 0,
    },
  });
}

export async function submitReview(input: ReviewFormInput): Promise<void> {
  const user = await requireUser();

  if (!isValidRating(input.rating)) {
    throw new ReviewError(`rating ${input.rating}`, 'invalidRating');
  }

  const product = await db.product.findFirst({
    where: { id: input.productId, isPublished: true },
    select: { id: true },
  });

  if (!product) {
    throw new ReviewError(`no published product ${input.productId}`, 'productNotFound');
  }

  // The same function the page asks, not a second copy of the same join —
  // see `hasDeliveredOrderFor` for what having two of them cost.
  if (!(await hasDeliveredOrderFor(user.id, input.productId))) {
    throw new ReviewError('no delivered order for this product', 'notPurchased');
  }

  try {
    await db.review.create({
      data: {
        productId: input.productId,
        userId: user.id,
        rating: input.rating,
        titleAr: input.title,
        body: input.body,
        // True by construction today — the delivered-order check above is what
        // makes it so — and written rather than defaulted so the day the rule
        // is relaxed, this line is the one that changes.
        isVerifiedPurchase: true,
        status: ReviewStatus.PENDING,
      },
    });
  } catch (error) {
    // `@@unique([productId, userId])` is the real guard: the eligibility read
    // that renders the form is a different request, and two submissions from
    // two tabs both pass it.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ReviewError('already reviewed', 'alreadyReviewed');
    }
    throw error;
  }

  /*
    No recompute here, deliberately. A PENDING review counts towards nothing,
    so the aggregate has not changed — and touching it would be the one place
    where writing a review moved a product's rating before anybody read it.
  */
}
