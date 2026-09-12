import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ShoppingBag } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { CartLines } from '@/features/cart/components/cart-lines';
import { ProductPrice } from '@/features/product/components/product-price';
import { findCart } from '@/server/services/cart';
import { getCartView } from '@/server/queries/cart';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'cart' });
  // A cart is per-visitor and changes constantly; there is nothing here for a
  // search engine to index, and indexing it would leak nothing useful anyway.
  return { title: t('title'), robots: { index: false, follow: true } };
}

export default async function CartPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tNav] = await Promise.all([
    getTranslations('cart'),
    getTranslations('nav'),
  ]);

  // findCart never creates a cart or sets a cookie — a visitor who has not
  // added anything simply has none, and Next forbids writing a cookie here.
  const cart = await findCart();
  const { lines, subtotalIqd, itemCount, hasBlockedLine } = await getCartView(
    cart?.id ?? null,
    locale,
  );

  return (
    <main className="container-page py-8 sm:py-12">
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t('title')}</h1>

      {lines.length === 0 ? (
        <EmptyCart
          title={t('empty')}
          hint={t('emptyHint')}
          action={t('continueShopping')}
        />
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
          <section aria-label={t('title')}>
            <CartLines lines={lines} />

            <Link
              href="/products"
              className="mt-6 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('continueShopping')}
            </Link>
          </section>

          {/*
            Sticky on desktop so the total and the checkout button stay in view
            while a long cart is scrolled. On phones it simply sits below the
            lines — a sticky panel there would eat the screen.
          */}
          <aside className="rounded-[--radius-panel] border border-border bg-surface p-5 lg:sticky lg:top-24">
            <h2 className="text-sm font-semibold text-ink">{t('summary')}</h2>

            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted">{t('subtotal')}</dt>
                <dd>
                  <ProductPrice
                    priceIqd={subtotalIqd}
                    comparePriceIqd={null}
                    size="sm"
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">{t('delivery')}</dt>
                {/*
                  Delivery depends on the governorate, which is asked for at
                  checkout. Naming that here is more honest than showing a
                  figure that changes on the next screen.
                */}
                <dd className="text-muted">{t('deliveryAtCheckout')}</dd>
              </div>
            </dl>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <span className="text-sm font-semibold text-ink">{t('total')}</span>
              <ProductPrice priceIqd={subtotalIqd} comparePriceIqd={null} size="md" />
            </div>

            <Button
              asChild={!hasBlockedLine}
              size="lg"
              block
              className="mt-5"
              disabled={hasBlockedLine}
            >
              {hasBlockedLine ? (
                <span>{t('checkout')}</span>
              ) : (
                <Link href="/checkout">{t('checkout')}</Link>
              )}
            </Button>

            {hasBlockedLine && (
              <p role="alert" className="mt-2 text-xs text-danger">
                {t('lineUnavailable')}
              </p>
            )}

            <p className="mt-3 text-center text-xs text-muted numeric">
              {itemCount} · {tNav('cart')}
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}

function EmptyCart({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action: string;
}) {
  return (
    <div className="mt-12 flex flex-col items-center rounded-[--radius-panel] border border-border bg-surface px-6 py-16 text-center">
      <ShoppingBag className="size-10 text-subtle" aria-hidden />
      <p className="mt-4 text-base font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>
      <Button asChild size="lg" className="mt-6">
        <Link href="/products">{action}</Link>
      </Button>
    </div>
  );
}
