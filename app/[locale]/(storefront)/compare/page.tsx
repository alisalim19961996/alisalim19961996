import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Scale, ShoppingBag } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ProductPrice } from '@/features/product/components/product-price';
import { CompareClearLink } from '@/features/compare/components/compare-clear-link';
import { getComparison } from '@/server/queries/compare';
import {
  COMPARE_PARAM,
  MAX_COMPARE,
  parseCompareSlugs,
} from '@/lib/domain/compare-url';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'compare' });

  /*
    Not indexed. The page is one combination of `?ids=` out of every
    combination of the catalogue — a factorial number of URLs, each a thin
    rearrangement of pages Google already has. Letting it be crawled is how a
    small shop spends its crawl budget on itself.
  */
  return { title: t('title'), robots: { index: false, follow: true } };
}

/**
 * Two to four products, side by side.
 *
 * Entirely driven by `?ids=`, so a comparison can be sent to somebody — which
 * is most of the point of making one (§8). Nothing is stored server-side and
 * the page has no client state; the tray that builds the list keeps its ticks
 * in `localStorage`, because a selection being assembled is a per-viewer
 * convenience while the finished comparison is a link.
 *
 * The rows come from the products' own specifications, which come from their
 * product type's `ProductTypeAttribute` links — so this file knows nothing
 * about phones, and a type invented from the dashboard compares on its own
 * specifications with no code changing (§6).
 */
export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations('compare');
  const raw = query[COMPARE_PARAM];
  const slugs = parseCompareSlugs(Array.isArray(raw) ? raw[0] : raw);
  const { columns, rows, missing, mixedTypes } = await getComparison(slugs, locale);

  if (columns.length === 0) {
    return (
      <div className="container-page py-8 sm:py-12">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t('title')}</h1>
        <div className="mt-10 rounded-[--radius-panel] border border-border bg-surface px-6 py-14 text-center">
          <Scale className="mx-auto size-8 text-subtle" aria-hidden />
          <h2 className="mt-4 text-base font-semibold text-ink">{t('emptyTitle')}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            {t('emptyBody', { max: MAX_COMPARE })}
          </p>
          <Button asChild className="mt-6">
            <Link href="/products">
              <ShoppingBag className="size-4" aria-hidden />
              {t('browse')}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">
            {t('comparing', { count: columns.length })}
          </p>
        </div>
        <CompareClearLink label={t('clear')} />
      </div>

      {/*
        Said plainly rather than refused. Comparing a phone with a cable is a
        thin table, not an error — and a page that rejected the combination
        would be arguing with a shopper about what they wanted to look at.
      */}
      {mixedTypes && <p className="mt-4 text-sm text-warning">{t('mixedTypes')}</p>}

      {missing.length > 0 && (
        <p className="mt-2 text-sm text-muted">
          {t('missing', { count: missing.length })}
        </p>
      )}

      {/*
        The one element in the store allowed to scroll sideways, and only
        inside its own box: four columns of specifications do not fit a phone,
        and the alternative — shrinking the text until they do — is worse. The
        page itself still has zero horizontal overflow, which the layout spec
        checks.
      */}
      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <caption className="sr-only">{t('tableCaption')}</caption>
          <thead>
            <tr>
              {/*
                An empty corner cell, but a real <th>: the row labels below are
                header cells too, and a data cell here would leave the table
                without a clean axis for a screen reader to read along.
              */}
              <th scope="col" className="w-36 p-3 text-start align-bottom sm:w-48">
                <span className="sr-only">{t('specification')}</span>
              </th>
              {columns.map((column) => (
                <th
                  key={column.slug}
                  scope="col"
                  className="min-w-40 border-s border-border p-3 text-start align-bottom font-normal"
                >
                  <Link href={`/products/${column.slug}`} className="group block">
                    <span className="relative block aspect-product overflow-hidden rounded-[--radius-card] bg-canvas">
                      {column.image ? (
                        <Image
                          src={column.image.url}
                          alt={column.image.alt}
                          fill
                          sizes="(max-width: 640px) 45vw, 20vw"
                          className="object-cover"
                        />
                      ) : null}
                      {column.image?.isDemo && (
                        <span className="absolute end-1 bottom-1 rounded bg-ink/55 px-1 py-0.5 text-[9px] font-medium text-white/90">
                          DEMO
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block text-[10px] font-medium tracking-wide text-subtle uppercase">
                      {column.brandName}
                    </span>
                    <span className="mt-0.5 block text-sm leading-tight font-semibold text-ink group-hover:underline">
                      {column.name}
                    </span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            <tr className="border-t border-border">
              <th scope="row" className="p-3 text-start font-medium text-muted">
                {t('price')}
              </th>
              {columns.map((column) => (
                <td key={column.slug} className="border-s border-border p-3">
                  {column.priceIqd === null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <ProductPrice
                      priceIqd={column.priceIqd}
                      comparePriceIqd={column.comparePriceIqd}
                      size="sm"
                    />
                  )}
                </td>
              ))}
            </tr>

            <tr className="border-t border-border bg-canvas/60">
              <th scope="row" className="p-3 text-start font-medium text-muted">
                {t('availability')}
              </th>
              {columns.map((column) => (
                <td key={column.slug} className="border-s border-border p-3">
                  <span className={column.purchasable ? 'text-success' : 'text-danger'}>
                    {column.purchasable ? t('inStock') : t('outOfStock')}
                  </span>
                </td>
              ))}
            </tr>

            <tr className="border-t border-border">
              <th scope="row" className="p-3 text-start font-medium text-muted">
                {t('warranty')}
              </th>
              {columns.map((column) => (
                <td key={column.slug} className="border-s border-border p-3 numeric">
                  {t('warrantyMonths', { count: column.warrantyMonths })}
                </td>
              ))}
            </tr>

            {rows.map((row, index) => (
              <tr
                key={row.key}
                className={
                  index % 2 === 0
                    ? 'border-t border-border bg-canvas/60'
                    : 'border-t border-border'
                }
              >
                <th scope="row" className="p-3 text-start font-medium text-muted">
                  {row.label}
                </th>
                {row.values.map((value, column) => (
                  <td
                    key={columns[column]?.slug ?? column}
                    className={
                      // Only where they actually disagree: a row where every
                      // product says the same is worth showing and not worth
                      // drawing the eye to.
                      row.differs
                        ? 'border-s border-border p-3 font-medium text-ink'
                        : 'border-s border-border p-3 text-ink-soft'
                    }
                  >
                    {value ?? <span className="text-subtle">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
