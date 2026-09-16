'use server';

import { revalidateProduct } from '@/server/revalidate';
import { submitReview, ReviewError } from '@/server/services/review';
import { getReviewEligibility, type ReviewEligibility } from '@/server/queries/review';
import { reviewFormSchema } from '@/schemas/review';

/**
 * Writing a review.
 *
 * A Server Action is a public endpoint, so the payload is parsed here and the
 * service checks the session, the product and the delivered order behind it.
 * Being signed in is not being entitled: the rule is that the customer
 * received this product, and only the database can answer that.
 */

/**
 * Whether this customer may write about this product.
 *
 * Read through an action rather than during render, and that is forced: the
 * answer depends on the session, and the product page is one of 32 that are
 * PRERENDERED. A `cookies()` read inside it would turn every one of them into
 * a per-request render (§8) — the same constraint that put the cart badge and
 * the wishlist heart on the client.
 *
 * Everything else about reviews — the average, the breakdown, the approved
 * list — is the same for every visitor and therefore stays in the static half
 * of the page.
 */
export async function getReviewEligibilityAction(
  productId: string,
): Promise<ReviewEligibility> {
  return getReviewEligibility(productId);
}

export interface ReviewActionResult {
  ok: boolean;
  /** Key under the `review` namespace in messages/, never a ready-made sentence. */
  errorKey?: string;
  /** Per-field message keys, for the two inputs that can be wrong on their own. */
  fieldErrors?: Partial<Record<'rating' | 'body' | 'title', string>>;
}

export async function submitReviewAction(input: {
  productId: string;
  rating: number;
  title?: string;
  body: string;
  productSlug: string;
}): Promise<ReviewActionResult> {
  const parsed = reviewFormSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: ReviewActionResult['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === 'rating' || field === 'body' || field === 'title') {
        fieldErrors[field] ??= issue.message;
      }
    }
    return { ok: false, errorKey: 'invalid', fieldErrors };
  }

  try {
    await submitReview(parsed.data);
  } catch (error) {
    if (error instanceof ReviewError) return { ok: false, errorKey: error.code };
    console.error('[review] submit failed', error);
    return { ok: false, errorKey: 'actionFailed' };
  }

  /*
    The product page is prerendered, and this changes what it must render for
    THIS customer — the form becomes "waiting to be approved". The review
    itself is PENDING and therefore still invisible to everyone else, which is
    why nothing about the rating summary has changed yet.
  */
  revalidateProduct(input.productSlug);
  return { ok: true };
}
