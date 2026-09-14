import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Link, redirect } from '@/i18n/navigation';
import { OrderHistory } from '@/features/order/components/order-history';
import { getCurrentUser } from '@/server/auth/guards';
import { getMyOrders } from '@/server/queries/order';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'account' });
  return { title: t('myOrders'), robots: { index: false, follow: false } };
}

/**
 * Every order this customer has placed.
 *
 * `getMyOrders()` calls `requireUser()` and scopes by the session's own id, so
 * the page's redirect is a courtesy for a signed-out visitor rather than the
 * thing keeping the data private (§7).
 */
export default async function AccountOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, raw] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) return redirect({ href: '/sign-in?next=account', locale });

  const t = await getTranslations('account');
  const tCommon = await getTranslations('common');

  const pageParam = Number(Array.isArray(raw.page) ? raw.page[0] : raw.page);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;

  const { rows, total, pageCount } = await getMyOrders(page);

  return (
    <div className="container-page py-8 sm:py-12">
      <Link
        href="/account"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4 flip-rtl" aria-hidden />
        {t('title')}
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-ink sm:text-3xl">{t('myOrders')}</h1>
      <p className="mt-1 text-sm text-muted numeric">
        {t('orderTotal', { count: total })}
      </p>

      <div className="mt-8">
        <OrderHistory rows={rows} locale={locale} />
      </div>

      {pageCount > 1 && (
        <nav
          aria-label={tCommon('pagination')}
          className="mt-8 flex items-center justify-center gap-3"
        >
          {page > 1 && (
            <Link
              href={`/account/orders?page=${page - 1}`}
              className="rounded-[--radius-control] border border-border px-4 py-2 text-sm text-ink transition-colors hover:border-border-strong"
            >
              {tCommon('previous')}
            </Link>
          )}
          <span className="text-sm text-muted numeric">
            {page} / {pageCount}
          </span>
          {page < pageCount && (
            <Link
              href={`/account/orders?page=${page + 1}`}
              className="rounded-[--radius-control] border border-border px-4 py-2 text-sm text-ink transition-colors hover:border-border-strong"
            >
              {tCommon('next')}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
