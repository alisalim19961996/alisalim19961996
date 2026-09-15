'use client';

import { useState, useTransition } from 'react';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { RATING_VALUES } from '@/lib/domain/review';
import { cn } from '@/lib/utils';
import { submitReviewAction } from '../actions';

/**
 * Writing a review.
 *
 * Rendered only for a customer who received this product — the page decides
 * that from the database, and this component is never the gate. It exists to
 * collect three values and to say clearly what happens next, which is that a
 * person reads it before anybody else does.
 *
 * The rating is a row of radio buttons wearing stars, not five divs with click
 * handlers: a radio group is arrowable, focusable and announced as "3 of 5" by
 * a screen reader, and no amount of `role` attributes on a div matches that.
 */
export function ReviewForm({
  productId,
  productSlug,
}: {
  productId: string;
  productSlug: string;
}) {
  const t = useTranslations('review');
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p className="rounded-[--radius-card] border border-success/30 bg-success-soft p-4 text-sm text-ink">
        {t('submitted')}
      </p>
    );
  }

  // Ascending for the control, because a row of stars is read left to right
  // even in Arabic — the stars themselves are not text.
  const stars = [...RATING_VALUES].reverse();
  const shown = hovered || rating;

  return (
    <form
      className="space-y-4 rounded-[--radius-card] border border-border bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setFieldErrors({});

        startTransition(async () => {
          const result = await submitReviewAction({
            productId,
            productSlug,
            rating,
            title,
            body,
          });

          if (result.ok) {
            setDone(true);
            return;
          }
          setError(result.errorKey ?? 'actionFailed');
          setFieldErrors(result.fieldErrors ?? {});
        });
      }}
    >
      <div>
        <h3 className="text-sm font-semibold text-ink">{t('writeTitle')}</h3>
        <p className="mt-1 text-xs text-muted">{t('moderationNote')}</p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink">{t('yourRating')}</legend>
        <div
          className="mt-2 flex items-center gap-1"
          onMouseLeave={() => setHovered(0)}
        >
          {stars.map((value) => (
            <label
              key={value}
              className="cursor-pointer p-0.5"
              onMouseEnter={() => setHovered(value)}
            >
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="peer sr-only"
              />
              <Star
                className={cn(
                  'size-7 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary',
                  value <= shown ? 'fill-warning text-warning' : 'text-border-strong',
                )}
                aria-hidden
              />
              <span className="sr-only">{t('starsCount', { count: value })}</span>
            </label>
          ))}
        </div>
        {fieldErrors.rating && (
          <p className="mt-1 text-xs text-danger">{t(fieldErrors.rating)}</p>
        )}
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="review-title" className="text-sm font-medium text-ink">
          {t('titleLabel')}
        </label>
        <input
          id="review-title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          className="h-11 w-full rounded-[--radius-control] border border-border-field bg-surface px-3 text-sm text-ink transition-colors hover:border-border-strong focus-visible:border-primary"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="review-body" className="text-sm font-medium text-ink">
          {t('bodyLabel')}
        </label>
        <textarea
          id="review-body"
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={5}
          maxLength={2000}
          aria-invalid={Boolean(fieldErrors.body)}
          className="w-full rounded-[--radius-control] border border-border-field bg-surface p-3 text-sm text-ink transition-colors hover:border-border-strong focus-visible:border-primary"
        />
        <p className="text-xs text-muted">{t('bodyHint')}</p>
        {fieldErrors.body && (
          <p className="text-xs text-danger">{t(fieldErrors.body)}</p>
        )}
      </div>

      {error && <p className="text-sm text-danger">{t(error)}</p>}

      <Button type="submit" disabled={pending || rating === 0}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
