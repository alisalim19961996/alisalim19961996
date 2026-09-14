import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft, Package, User } from 'lucide-react';
import { Link, redirect } from '@/i18n/navigation';
import { SignOutButton } from '@/features/auth/components/sign-out-button';
import { OrderHistory } from '@/features/order/components/order-history';
import { getCurrentUser } from '@/server/auth/guards';
import { getMyOrders } from '@/server/queries/order';
import { formatIraqiPhone } from '@/lib/phone';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'account' });
  // Never indexed: it exists only for the person signed into it.
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * The customer's own corner of the store.
 *
 * Signed out, this sends them to sign in and back — `?next=account` rather
 * than a URL taken from the query string, which is the same rule the dashboard
 * redirect follows (§8): a `next` that is only ever compared against known
 * literals cannot be crafted into an open redirect.
 *
 * Recent orders live here rather than behind another click, because checking
 * an order is the only reason most customers open this page at all.
 */
export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) return redirect({ href: '/sign-in?next=account', locale });

  const t = await getTranslations('account');
  const { rows, total } = await getMyOrders(1);

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">
            {t('greeting', { name: user.name })}
          </p>
        </div>
        <SignOutButton label={t('signOut')} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="rounded-[--radius-card] border border-border bg-surface p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <User className="size-4 text-muted" aria-hidden />
            {t('details')}
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted">{t('name')}</dt>
              <dd className="text-ink">{user.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('email')}</dt>
              <dd className="truncate text-ink numeric">{user.email}</dd>
            </div>
            {user.phone && (
              <div>
                <dt className="text-xs text-muted">{t('phone')}</dt>
                <dd className="text-ink numeric">{formatIraqiPhone(user.phone)}</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-xs text-muted">{t('detailsHint')}</p>
        </section>

        <section className="lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Package className="size-4 text-muted" aria-hidden />
              {t('recentOrders')}
            </h2>
            {total > rows.length && (
              <Link
                href="/account/orders"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                {t('allOrders', { count: total })}
                <ArrowLeft className="size-4 flip-rtl" aria-hidden />
              </Link>
            )}
          </div>

          <div className="mt-4">
            <OrderHistory rows={rows} locale={locale} />
          </div>
        </section>
      </div>
    </div>
  );
}
