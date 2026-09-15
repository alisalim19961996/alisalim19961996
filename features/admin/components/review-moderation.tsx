'use client';

import { useState, useTransition } from 'react';
import { Check, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { deleteReviewAction, moderateReviewAction } from '../actions';
import type { ReviewTab } from '@/server/queries/admin-reviews';

/**
 * Approve, reject, or delete one review.
 *
 * Three controls rather than two, because rejecting and deleting answer
 * different questions. Rejecting hides the review and keeps the record of who
 * decided and when; deleting is for text that should not be stored at all — a
 * phone number, an address, abuse aimed at a person. The screen says which is
 * which rather than leaving the owner to guess from an icon.
 *
 * Delete asks first. It is the only control here that cannot be undone.
 */
export function ReviewModeration({
  reviewId,
  productSlug,
  status,
}: {
  reviewId: string;
  productSlug: string;
  status: ReviewTab;
}) {
  const t = useTranslations('admin');
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (operation: () => Promise<{ ok: boolean; errorKey?: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await operation();
      if (!result.ok) setError(result.errorKey ?? 'actionFailed');
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== 'approved' && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() => moderateReviewAction({ reviewId, productSlug, approve: true }))
          }
        >
          <Check aria-hidden />
          {t('approve')}
        </Button>
      )}

      {status !== 'rejected' && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(() => moderateReviewAction({ reviewId, productSlug, approve: false }))
          }
        >
          <X aria-hidden />
          {t('reject')}
        </Button>
      )}

      {confirming ? (
        <span className="flex items-center gap-2">
          <span className="text-xs text-danger">{t('confirmDeleteReview')}</span>
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => run(() => deleteReviewAction({ reviewId, productSlug }))}
          >
            {t('confirm')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            {t('cancel')}
          </Button>
        </span>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden />
          {t('delete')}
        </Button>
      )}

      {error && <span className="text-xs text-danger">{t(error)}</span>}
    </div>
  );
}
