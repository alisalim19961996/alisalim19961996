import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft, Package, User } from 'lucide-react';
import { Link, redirect } from '@/i18n/navigation';
import { SignOutButton } from '@/features/auth/components/sign-out-button';
import { OrderHistory } from '@/features/order/components/order-history';
import { getCurrentUser } from '@/server/auth/guards';
import { getMyOrders } from '@/server/queries/order';
import { formatIraqiPhone } from '@/lib/phone';
import { ProfileForm } from '@/features/account/components/profile-form';
import { AddressForm } from '@/features/account/components/address-form';
import { getMyDeliveryAddress } from '@/server/queries/account';
import { GOVERNORATE_VALUES } from '@/schemas/address';
import { MapPin } from 'lucide-react';
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
  const [{ rows, total }, address] = await Promise.all([
    getMyOrders(1),
    getMyDeliveryAddress(),
  ]);

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
        <section className="rounded-card border border-border bg-surface p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <User className="size-4 text-muted" aria-hidden />
            {t('details')}
          </h2>
          {/*
            The email is shown and not editable, and the hint says why: it is
            the sign-in identity, so moving it needs a confirmation to the OLD
            address — which needs mail, which is not configured (§7). A field
            that quietly refuses is worse than a line that explains.
          */}
          <dl className="mt-4 text-sm">
            <dt className="text-xs text-muted">{t('email')}</dt>
            <dd className="truncate text-ink numeric">{user.email}</dd>
          </dl>
          <p className="mt-1 text-xs text-muted">{t('emailHint')}</p>

          <ProfileForm
            defaultName={user.name}
            defaultPhone={user.phone ? formatIraqiPhone(user.phone) : ''}
          />
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

        <section className="rounded-card border border-border bg-surface p-6 lg:col-span-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <MapPin className="size-4 text-muted" aria-hidden />
            {t('savedAddress')}
          </h2>
          {/*
            A convenience, not a record. Checkout still snapshots whatever was
            typed onto the order itself, so saving a new address here never
            rewrites where last month's order was delivered.
          */}
          <p className="mt-1 text-xs text-muted">{t('savedAddressHint')}</p>

          <AddressForm
            governorates={GOVERNORATE_VALUES}
            defaults={
              address
                ? {
                    fullName: address.fullName,
                    phone: formatIraqiPhone(address.phone),
                    governorate: address.governorate,
                    city: address.city,
                    addressLine: address.addressLine,
                    notes: address.notes ?? '',
                  }
                : null
            }
          />
        </section>
      </div>
    </div>
  );
}
