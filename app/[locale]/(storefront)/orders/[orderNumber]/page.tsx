import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CheckCircle2, PackageCheck, XCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { OrderDetail } from '@/features/order/components/order-detail';
import { findOwnedOrder } from '@/server/queries/order';
import { ORDER_GRANT_COOKIE } from '@/server/services/order';
import { getCurrentUser } from '@/server/auth/guards';
import { normalizeOrderNumber } from '@/lib/domain/order-number';
import { orderTone } from '@/lib/domain/order-state';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'order' });
  // Never indexed: an order page is personal data, and the URL contains a
  // reference a search engine has no business crawling.
  return { title: t('confirmedTitle'), robots: { index: false, follow: false } };
}

/**
 * The confirmation page, and the page a customer returns to.
 *
 * Order numbers are sequential, so the URL alone proves nothing. Access needs
 * either the grant issued to the browser that placed the order (or that passed
 * the tracking form) or a session belonging to the buyer. Anyone else is sent
 * to the tracking form, where the phone number is the credential.
 *
 * `?placed=1` only changes the greeting. It arrives from the checkout redirect
 * and could equally be typed by anybody — which is why it decides nothing else:
 * it cannot show an order, and the status below it comes from the row.
 */
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale; orderNumber: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { locale, orderNumber: raw } = await params;
  setRequestLocale(locale);

  const [t, tCart] = await Promise.all([
    getTranslations('order'),
    getTranslations('cart'),
  ]);

  const orderNumber = normalizeOrderNumber(decodeURIComponent(raw));
  const [user, store, query] = await Promise.all([
    getCurrentUser(),
    cookies(),
    searchParams,
  ]);

  const order = orderNumber
    ? await findOwnedOrder(
        orderNumber,
        {
          userId: user?.id ?? null,
          grant: store.get(ORDER_GRANT_COOKIE)?.value ?? null,
        },
        locale,
      )
    : null;

  if (!order) {
    return (
      <div className="container-page py-16">
        <div className="mx-auto max-w-md rounded-[--radius-panel] border border-border bg-surface p-8 text-center">
          <p className="text-base font-semibold text-ink">{t('notFound')}</p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/track">{t('trackTitle')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  /*
    The greeting is built from the order's own status, not from the fact that
    this page can render. It used to open with a green tick and "your order is
    placed" for every order — including a CANCELLED one, which the status badge
    then contradicted further down the same page.

    "Just placed" is the one case the row cannot tell us, so it comes from the
    checkout redirect. Everything else is the status.
  */
  const justPlaced = query.placed === '1' && order.status === 'PENDING';
  const tone = orderTone(order.status);

  const HeroIcon =
    tone === 'failed' ? XCircle : tone === 'delivered' ? PackageCheck : CheckCircle2;

  const heroToneClass =
    tone === 'failed'
      ? 'border-danger-soft bg-danger-soft'
      : tone === 'delivered'
        ? 'border-success-soft bg-success-soft'
        : 'border-border bg-canvas';

  const heroIconClass =
    tone === 'failed'
      ? 'text-danger'
      : tone === 'delivered'
        ? 'text-success'
        : 'text-ink-soft';

  return (
    <div className="container-page py-8 sm:py-12">
      <div
        className={cn(
          'flex flex-col items-center rounded-panel border px-6 py-8 text-center',
          heroToneClass,
        )}
      >
        <HeroIcon className={cn('size-10', heroIconClass)} aria-hidden />
        <h1 className="mt-3 text-2xl font-bold text-ink">
          {justPlaced ? t('confirmedTitle') : t(`status${order.status}`)}
        </h1>
        {justPlaced ? (
          <p className="mt-1 text-sm text-ink-soft">{t('confirmedHint')}</p>
        ) : null}
        <p className="mt-4 text-xs text-muted">{t('saveNumber')}</p>
        <p className="mt-1 text-xl font-bold text-ink numeric">{order.orderNumber}</p>
      </div>

      <div className="mt-10">
        <OrderDetail order={order} locale={locale} />
      </div>

      <div className="mt-10 text-center">
        <Button asChild variant="outline" size="lg">
          <Link href="/products">{tCart('continueShopping')}</Link>
        </Button>
      </div>
    </div>
  );
}
