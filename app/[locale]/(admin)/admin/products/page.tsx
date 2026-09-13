import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus, Search } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProductPrice } from '@/features/product/components/product-price';
import { ProductPublishToggle } from '@/features/admin/components/product-row-actions';
import { getAdminProducts } from '@/server/queries/admin-products';
import { adminProductFilterSchema } from '@/schemas/product';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('products'), robots: { index: false, follow: false } };
}

/**
 * The catalogue, as the owner sees it.
 *
 * Drafts and published products live in one list with a filter rather than in
 * two places: a draft the owner forgot about is a product that never went on
 * sale, and hiding it behind a tab is how it stays forgotten.
 */
export default async function AdminProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, rawParams] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations('admin');

  const filters = adminProductFilterSchema.parse(rawParams);
  const { rows, total, page, pageCount, counts } = await getAdminProducts(filters);

  const dateFormat = new Intl.DateTimeFormat(
    locale === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB',
    { dateStyle: 'short', timeZone: 'Asia/Baghdad' },
  );

  const tabs = [
    { status: undefined, label: t('allProducts'), count: counts.all },
    { status: 'published' as const, label: t('published'), count: counts.published },
    { status: 'draft' as const, label: t('draft'), count: counts.draft },
  ];

  const pageHref = (number: number) =>
    `/admin/products?${new URLSearchParams({
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.q ? { q: filters.q } : {}),
      page: String(number),
    }).toString()}` as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{t('products')}</h1>
          <p className="text-sm text-muted numeric">{total}</p>
        </div>
        <Button asChild>
          <Link href="/admin/products/new">
            <Plus aria-hidden />
            {t('newProduct')}
          </Link>
        </Button>
      </div>

      <nav aria-label={t('filterByStatus')} className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-1">
          {tabs.map((tab) => {
            const active = filters.status === tab.status;
            return (
              <li key={tab.label} className="shrink-0">
                <Link
                  href={
                    `/admin/products${tab.status ? `?status=${tab.status}` : ''}` as const
                  }
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'inline-flex items-center gap-1.5 rounded-[--radius-control] bg-ink px-3 py-1.5 text-sm font-medium text-white'
                      : 'inline-flex items-center gap-1.5 rounded-[--radius-control] px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-ink'
                  }
                >
                  {tab.label}
                  <span className="text-xs numeric opacity-70">{tab.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form action="/admin/products" className="flex gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={filters.q ?? ''}
          placeholder={t('searchProducts')}
          aria-label={t('searchProducts')}
          className="max-w-sm"
        />
        <Button type="submit" variant="outline">
          <Search aria-hidden />
          <span className="sr-only sm:not-sr-only">{t('search')}</span>
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-[--radius-card] border border-border bg-surface px-5 py-12 text-center text-sm text-muted">
          {t('noProducts')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="border-b border-border">
              <tr className="text-xs text-muted">
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  {t('product')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  {t('productType')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  {t('variants')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  {t('updated')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-end font-medium">
                  {t('priceFrom')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-end font-medium">
                  {t('status')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-canvas">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {row.imageUrl && (
                        <Image
                          src={row.imageUrl}
                          alt=""
                          width={40}
                          height={50}
                          className="aspect-product w-10 rounded-[--radius-control] object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/admin/products/${row.id}`}
                          className="font-medium text-ink hover:text-primary"
                        >
                          {locale === 'ar' ? row.nameAr : row.nameEn}
                        </Link>
                        <p className="truncate text-xs text-subtle">{row.brandName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {locale === 'ar' ? row.typeNameAr : row.typeNameEn}
                  </td>
                  <td className="px-4 py-3 text-muted numeric">{row.variantCount}</td>
                  <td className="px-4 py-3 text-muted numeric">
                    {dateFormat.format(row.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {row.minPriceIqd === null ? (
                      <span className="text-xs text-subtle">{t('noPrice')}</span>
                    ) : (
                      <ProductPrice
                        priceIqd={row.minPriceIqd}
                        comparePriceIqd={null}
                        size="sm"
                        className="justify-end"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Badge variant={row.isPublished ? 'success' : 'neutral'}>
                        {row.isPublished ? t('published') : t('draft')}
                      </Badge>
                      <ProductPublishToggle id={row.id} isPublished={row.isPublished} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label={t('pages')}>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
            <Link
              key={number}
              href={pageHref(number)}
              aria-current={number === page ? 'page' : undefined}
              className={
                number === page
                  ? 'grid size-9 place-items-center rounded-[--radius-control] bg-ink text-sm font-medium text-white numeric'
                  : 'grid size-9 place-items-center rounded-[--radius-control] border border-border text-sm text-ink numeric hover:bg-surface'
              }
            >
              {number}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
