import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CheckCircle2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { OrderDetail } from '@/features/order/components/order-detail';
import { findOwnedOrder } from '@/server/queries/order';
import { RECENT_ORDER_COOKIE } from '@/server/services/order';
import { getCurrentUser } from '@/server/auth/guards';
import { normalizeOrderNumber } from '@/lib/domain/order-number';
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
 * either the httpOnly cookie written at checkout — this browser placed the
 * order — or a session belonging to the buyer. Anyone else is sent to the
 * tracking form, where the phone number is the credential.
 */
export default async function OrderPage({
  params,
}: {
  params: Promise<{ locale: Locale; orderNumber: string }>;
}) {
  const { locale, orderNumber: raw } = await params;
  setRequestLocale(locale);

  const [t, tCart] = await Promise.all([
    getTranslations('order'),
    getTranslations('cart'),
  ]);

  const orderNumber = normalizeOrderNumber(decodeURIComponent(raw));
  const [user, store] = await Promise.all([getCurrentUser(), cookies()]);

  const order = orderNumber
    ? await findOwnedOrder(
        orderNumber,
        {
          userId: user?.id ?? null,
          allowedOrderNumber: store.get(RECENT_ORDER_COOKIE)?.value ?? null,
        },
        locale,
      )
    : null;

  if (!order) {
    return (
      <main className="container-page py-16">
        <div className="mx-auto max-w-md rounded-[--radius-panel] border border-border bg-surface p-8 text-center">
          <p className="text-base font-semibold text-ink">{t('notFound')}</p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/track">{t('trackTitle')}</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="container-page py-8 sm:py-12">
      <div className="flex flex-col items-center rounded-[--radius-panel] border border-success-soft bg-success-soft px-6 py-8 text-center">
        <CheckCircle2 className="size-10 text-success" aria-hidden />
        <h1 className="mt-3 text-2xl font-bold text-ink">{t('confirmedTitle')}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t('confirmedHint')}</p>
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
    </main>
  );
}
