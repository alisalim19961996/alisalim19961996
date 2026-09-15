import { getLocale, getTranslations } from 'next-intl/server';
import { BadgeCheck } from 'lucide-react';
import { StarRating } from './star-rating';
import { ReviewComposer } from './review-composer';
import type { ProductReview, ReviewSummary } from '@/server/queries/review';
import type { Locale } from '@/i18n/routing';

/**
 * Everything about a product's reviews, on its page.
 *
 * A server component for everything that is the same for every visitor — the
 * average, the breakdown and the approved reviews — so all of it stays in the
 * static half of a prerendered page. Only the box where a form might go knows
 * who is looking, and that part loads after hydration (§8).
 *
 * With no reviews it says so and stops. A shop that has not sold anything yet
 * has no ratings, and the honest rendering of that is a sentence — not a row
 * of empty stars, which reads as a product everybody disliked.
 */
export async function ReviewSection({
  productId,
  productSlug,
  summary,
  reviews,
}: {
  productId: string;
  productSlug: string;
  summary: ReviewSummary;
  reviews: ProductReview[];
}) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('review');

  const formatter = new Intl.DateTimeFormat(
    locale === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-US',
    {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    },
  );

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="text-lg font-bold text-ink">{t('heading')}</h2>

      <div className="mt-6 grid gap-8 lg:grid-cols-[18rem_1fr]">
        <div>
          {summary.count === 0 ? (
            <p className="text-sm text-muted">{t('noneYet')}</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold text-ink numeric">
                  {summary.average}
                </span>
                <div>
                  <StarRating average={summary.average} />
                  <p className="mt-0.5 text-xs text-muted">
                    {t('basedOn', { count: summary.count })}
                  </p>
                </div>
              </div>

              <ul className="mt-4 space-y-1.5">
                {summary.buckets.map((bucket) => (
                  <li key={bucket.rating} className="flex items-center gap-2 text-xs">
                    <span className="w-12 shrink-0 text-muted numeric">
                      {t('starsCount', { count: bucket.rating })}
                    </span>
                    {/* A logical track: the bar has to grow from the start edge
                        in both directions (§11). */}
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                      <span
                        className="block h-full rounded-full bg-warning"
                        style={{ width: `${bucket.percent}%` }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-end text-muted numeric">
                      {bucket.count}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/*
            The one part that depends on who is looking, and therefore the one
            part that loads after hydration — see ReviewComposer.
          */}
          <div className="mt-6">
            <ReviewComposer productId={productId} productSlug={productSlug} />
          </div>
        </div>

        <div>
          {reviews.length === 0 ? (
            <p className="text-sm text-muted">{t('noneToShow')}</p>
          ) : (
            <ul className="space-y-6">
              {reviews.map((review) => (
                <li
                  key={review.id}
                  className="border-b border-border pb-6 last:border-0"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StarRating average={review.rating} size="sm" />
                    <span className="text-sm font-medium text-ink">
                      {review.authorName}
                    </span>
                    {review.isVerifiedPurchase && (
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <BadgeCheck className="size-3.5" aria-hidden />
                        {t('verifiedPurchase')}
                      </span>
                    )}
                    <span className="text-xs text-subtle numeric">
                      {formatter.format(review.createdAt)}
                    </span>
                  </div>

                  {review.title && (
                    <h3 className="mt-2 text-sm font-semibold text-ink">
                      {review.title}
                    </h3>
                  )}

                  {/*
                    Plain text in a paragraph, never markup. What a customer
                    typed is rendered by React, which escapes it — the same
                    property the buying guides have by construction (§12).
                    `whitespace-pre-line` keeps their paragraph breaks without
                    giving them a single tag.
                  */}
                  <p className="mt-1.5 text-sm whitespace-pre-line text-ink-soft">
                    {review.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
