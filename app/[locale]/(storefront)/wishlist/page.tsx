import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Heart, ShoppingBag } from 'lucide-react';
import { Link, redirect } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ProductCard } from '@/features/product/components/product-card';
import { getCurrentUser } from '@/server/auth/guards';
import { WishlistRefresher } from '@/features/wishlist/components/wishlist-refresher';
import { getWishlist } from '@/server/queries/wishlist';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'wishlist' });
  // Never indexed: like /account, it exists only for the person signed into it.
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * The products a customer saved.
 *
 * Signed out, this sends them to sign in and back — `?next=account` rather
 * than a path from the query string, the same rule §8 states for the dashboard
 * and the account: a `next` only ever compared against known literals cannot be
 * crafted into an open redirect. Landing on `/account` rather than here is the
 * price of not making it one.
 *
 * The cards are the ordinary `ProductCard`, so the heart on each one is the
 * same control as everywhere else and unsaving removes the card on the next
 * read. Nothing here knows it is a wishlist except the query.
 */
export default async function WishlistPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) return redirect({ href: '/sign-in?next=account', locale });

  const t = await getTranslations('wishlist');
  const { products, unavailable } = await getWishlist();

  return (
    <div className="container-page py-8 sm:py-12">
      <WishlistRefresher />
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t('title')}</h1>
      <p className="mt-1 text-sm text-muted">
        {products.length > 0 ? t('count', { count: products.length }) : t('subtitle')}
      </p>

      {products.length === 0 ? (
        <div className="mt-10 rounded-[--radius-panel] border border-border bg-surface px-6 py-14 text-center">
          <Heart className="mx-auto size-8 text-subtle" aria-hidden />
          <h2 className="mt-4 text-base font-semibold text-ink">{t('emptyTitle')}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{t('emptyBody')}</p>
          <Button asChild className="mt-6">
            <Link href="/products">
              <ShoppingBag className="size-4" aria-hidden />
              {t('browse')}
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {products.map((product, index) => (
            <li key={product.id} className="flex">
              <ProductCard product={product} priority={index < 4} />
            </li>
          ))}
        </ul>
      )}

      {/*
        Counted, not listed. A product the owner unpublished has no page to
        link to, so its card would be a dead end — but dropping it in silence
        is worse, because the customer saved it and would decide the list lost
        it. The row is still there and republishing brings the card back.
      */}
      {unavailable > 0 && (
        <p className="mt-6 text-sm text-muted">
          {t('unavailable', { count: unavailable })}
        </p>
      )}
    </div>
  );
}
