import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BadgeCheck, ExternalLink } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { StarRating } from '@/features/review/components/star-rating';
import { ReviewModeration } from '@/features/admin/components/review-moderation';
import { getAdminReviews, type ReviewTab } from '@/server/queries/admin-reviews';
import type { Locale } from '@/i18n/routing';
import { dateFormatter } from '@/lib/datetime';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('reviews'), robots: { index: false, follow: false } };
}

/**
 * The moderation queue.
 *
 * A queue, not a list: it opens on what is waiting and is ordered oldest
 * first, because the customer who has been waiting longest is the one to
 * answer next. Nothing a customer wrote reaches a product page until somebody
 * has read it here (§12).
 *
 * Every review is shown in full. A truncated body with a "read more" is how a
 * moderator approves something whose second paragraph they never saw.
 */
export default async function AdminReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, rawParams] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const raw = rawParams['status'];
  // Anything else falls back to the queue, rather than throwing: the value
  // comes from the address bar, so it comes from anyone.
  const tab: ReviewTab =
    raw === 'approved' ? 'approved' : raw === 'rejected' ? 'rejected' : 'pending';

  const list = await getAdminReviews(tab, Number(rawParams['page']) || 1);
  const isAr = locale === 'ar';

  const dateFormat = dateFormatter(locale, 'medium');

  const tabs = [
    {
      label: t('reviewsPending'),
      href: '/admin/reviews' as const,
      active: tab === 'pending',
      // The one count worth carrying on a tab: it is the size of the work.
      count: list.pendingCount,
    },
    {
      label: t('reviewsApproved'),
      href: '/admin/reviews?status=approved' as const,
      active: tab === 'approved',
      count: null,
    },
    {
      label: t('reviewsRejected'),
      href: '/admin/reviews?status=rejected' as const,
      active: tab === 'rejected',
      count: null,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">{t('reviews')}</h1>
        <p className="text-sm text-muted numeric">{list.total}</p>
      </div>

      <p className="max-w-prose text-sm text-muted">{t('reviewsHint')}</p>

      <ul className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              className={
                tab.active
                  ? 'inline-flex items-center gap-1.5 rounded-control bg-ink px-3 py-1.5 text-xs font-medium text-white'
                  : 'inline-flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-border-strong'
              }
            >
              {tab.label}
              {tab.count ? <span className="numeric">({tab.count})</span> : null}
            </Link>
          </li>
        ))}
      </ul>

      {list.rows.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted">
          {t('noReviews')}
        </p>
      ) : (
        <ul className="space-y-4">
          {list.rows.map((row) => (
            <li
              key={row.id}
              className="space-y-3 rounded-card border border-border bg-surface p-5"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StarRating average={row.rating} size="sm" />
                <span className="text-sm font-medium text-ink">{row.authorName}</span>
                {row.isVerifiedPurchase && (
                  <span className="inline-flex items-center gap-1 text-xs text-success">
                    <BadgeCheck className="size-3.5" aria-hidden />
                    {t('verifiedPurchase')}
                  </span>
                )}
                <span className="text-xs text-subtle numeric">
                  {dateFormat.format(row.createdAt)}
                </span>
                <Link
                  href={`/products/${row.product.slug}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  {isAr ? row.product.nameAr : row.product.nameEn}
                  <ExternalLink className="size-3 flip-rtl" aria-hidden />
                </Link>
              </div>

              {row.title && (
                <h2 className="text-sm font-semibold text-ink">{row.title}</h2>
              )}

              {/*
                Plain text, whole. React escapes it, so a pasted tag is a
                sentence — and the moderator sees every line of what they are
                approving rather than the first two.
              */}
              <p className="text-sm whitespace-pre-line text-ink-soft">{row.body}</p>

              <ReviewModeration
                reviewId={row.id}
                productSlug={row.product.slug}
                status={row.status}
              />
            </li>
          ))}
        </ul>
      )}

      {list.pageCount > 1 && (
        <p className="text-sm text-muted numeric">
          {t('pageOf', { page: list.page, total: list.pageCount })}
        </p>
      )}
    </div>
  );
}
