'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { ReviewForm } from './review-form';
import { getReviewEligibilityAction } from '../actions';
import type { ReviewEligibility } from '@/server/queries/review';

/**
 * The part of the review section that depends on who is looking.
 *
 * It exists as a client component for one reason: the product page is
 * prerendered, and reading the session during its render would make all 32
 * product pages dynamic (§8). So the page ships without knowing, and this asks
 * once after hydration — the same shape as `CartCountBadge`.
 *
 * A skeleton while it asks, not an empty gap: the answer is usually "you have
 * not bought this", and a form that appears a second late for the few who can
 * write one is better than a page that jumps for everybody.
 */
export function ReviewComposer({
  productId,
  productSlug,
}: {
  productId: string;
  productSlug: string;
}) {
  const t = useTranslations('review');
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null);

  useEffect(() => {
    let live = true;

    getReviewEligibilityAction(productId)
      .then((result) => {
        if (live) setEligibility(result);
      })
      .catch(() => {
        // A failed read is not worth an error here: the page still shows every
        // review, and the form is the only thing missing.
        if (live) setEligibility({ can: false, reason: 'signedOut' });
      });

    return () => {
      live = false;
    };
  }, [productId]);

  if (eligibility === null) return <Skeleton className="h-10 w-full" />;

  if (eligibility.can) {
    return <ReviewForm productId={productId} productSlug={productSlug} />;
  }

  if (eligibility.reason === 'signedOut') {
    // A link, because there is something to do about it. The other reasons are
    // statements of fact, and a link would promise otherwise.
    return (
      <p className="text-sm text-muted">
        <Link href="/sign-in" className="text-primary hover:underline">
          {t('signInToReview')}
        </Link>
      </p>
    );
  }

  return <p className="text-sm text-muted">{t(eligibility.reason)}</p>;
}
