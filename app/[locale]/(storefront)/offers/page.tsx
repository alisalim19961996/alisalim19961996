import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { ProductCard } from '@/features/product/components/product-card';
import { Pagination } from '@/features/catalogue/components/pagination';
import { getCatalogue } from '@/server/queries/catalogue';
import { buildAlternates } from '@/lib/seo';
import { PRODUCTS_PER_PAGE } from '@/config/ui';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'offers' });
  return {
    title: t('title'),
    description: t('intro'),
    alternates: buildAlternates('/offers', locale),
  };
}

/**
 * Everything currently carrying a real discount.
 *
 * "Real" is not a judgement call here: a `comparePriceIqd` may only exist when
 * it is strictly greater than the price — a CHECK constraint enforces it (§6)
 * — so a product on this page is discounted or it is not on this page. That is
 * why the page can be this thin.
 *
 * It runs the ordinary catalogue query with `onOfferOnly`, so filtering and
 * paging stay in SQL (§5) and the discount badge each card already renders is
 * the same one the rest of the store uses. A second "offers" implementation
 * would be the copy that drifts.
 */
export default async function OffersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, raw] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations('offers');

  const pageParam = Number(Array.isArray(raw.page) ? raw.page[0] : raw.page);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;

  const result = await getCatalogue(
    { onOfferOnly: true },
    'newest',
    page,
    PRODUCTS_PER_PAGE,
  );

  return (
    <div className="container-page py-8 sm:py-12">
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t('title')}</h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        {t('intro')}
      </p>

      {result.total === 0 ? (
        <div className="mt-10 rounded-card border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">{t('empty')}</p>
          <Link
            href="/products"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            {t('browseAll')}
            <ArrowLeft className="size-4 flip-rtl" aria-hidden />
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted numeric">
              {t('count', { count: result.total })}
            </p>
            {/*
              It said "view all" and led to the same set of products, which
              reads as a promise that something is being held back. What the
              catalogue actually adds is the filter panel, so the link says
              that instead — same destination, honest label.
            */}
            <Link
              href="/products?offer=1"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              {t('filterOffers')}
              <ArrowLeft className="size-4 flip-rtl" aria-hidden />
            </Link>
          </div>

          <h2 className="sr-only">{t('title')}</h2>
          <ul className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {result.products.map((product, index) => (
              <li key={product.id} className="flex">
                <ProductCard product={product} priority={index < 4} />
              </li>
            ))}
          </ul>

          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            searchParams={new URLSearchParams({ page: String(result.page) })}
            basePath="/offers"
          />
        </>
      )}
    </div>
  );
}
