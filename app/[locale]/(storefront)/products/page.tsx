import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SearchX } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ProductCard } from '@/features/product/components/product-card';
import {
  ActiveFilters,
  FilterPanel,
} from '@/features/catalogue/components/filter-panel';
import {
  MobileFilterButton,
  SortSelect,
} from '@/features/catalogue/components/catalogue-toolbar';
import { Pagination } from '@/features/catalogue/components/pagination';
import { getCatalogue, getCatalogueFacets } from '@/server/queries/catalogue';
import {
  countActiveFilters,
  parseCatalogueParams,
  PER_PAGE,
  toFilters,
} from '@/schemas/catalogue';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'catalogue' });

  return {
    title: t('title'),
    description: t('metaDescription'),
    alternates: {
      canonical: `/${locale}/products`,
      languages: { ar: '/ar/products', en: '/en/products' },
    },
    // Filtered permutations are near-duplicates of the same set; they stay
    // crawlable for discovery but out of the index to avoid bloat.
    robots: { index: true, follow: true },
  };
}

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const raw = await searchParams;
  const parsed = parseCatalogueParams(raw);
  const filters = toFilters(parsed);

  const t = await getTranslations('catalogue');

  const [result, facets] = await Promise.all([
    getCatalogue(filters, parsed.sort, parsed.page, PER_PAGE),
    getCatalogueFacets(filters),
  ]);

  // Rebuilt rather than passed through, so pagination links carry exactly the
  // params that survived validation — not whatever was in the address bar.
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) urlParams.set(key, first);
  }

  const activeCount = countActiveFilters(parsed);

  return (
    <div className="container-page py-8 lg:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          {parsed.q ? t('resultsFor', { query: parsed.q }) : t('title')}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {t('productCount', { count: result.total })}
        </p>
      </header>

      <div className="flex flex-col gap-8 lg:flex-row">
        <aside className="hidden w-64 shrink-0 lg:block">
          <FilterPanel facets={facets} />
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <MobileFilterButton facets={facets} activeCount={activeCount} />
            <div className="ms-auto">
              <SortSelect />
            </div>
          </div>

          <div className="mb-6">
            <ActiveFilters facets={facets} />
          </div>

          {result.products.length === 0 ? (
            <EmptyState hasFilters={activeCount > 0 || Boolean(parsed.q)} />
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {result.products.map((product, index) => (
                  <li key={product.id} className="flex">
                    {/* The first row is above the fold on every breakpoint. */}
                    <ProductCard product={product} priority={index < 4} />
                  </li>
                ))}
              </ul>

              <Pagination
                page={result.page}
                pageCount={result.pageCount}
                searchParams={urlParams}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

async function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  const [t, tEmpty] = await Promise.all([
    getTranslations('catalogue'),
    getTranslations('empty'),
  ]);

  return (
    <div className="grid place-items-center rounded-[--radius-panel] border border-dashed border-border py-20 text-center">
      <SearchX className="size-8 text-subtle" aria-hidden="true" />
      <p className="mt-4 text-base font-semibold text-ink">{tEmpty('noProducts')}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{tEmpty('noProductsHint')}</p>
      {hasFilters && (
        <Button variant="outline" className="mt-6" asChild>
          <Link href="/products">{t('clearAll')}</Link>
        </Button>
      )}
    </div>
  );
}
