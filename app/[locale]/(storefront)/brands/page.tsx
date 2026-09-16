import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getBrands } from '@/server/queries/catalogue';
import { buildAlternates } from '@/lib/seo';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'brands' });
  return {
    title: t('title'),
    description: t('intro'),
    alternates: buildAlternates('/brands', locale),
  };
}

/**
 * Every brand MPS carries, with how many products sit behind each.
 *
 * The footer has linked here since Phase 2 and it 404'd — one of five dead
 * links a customer could reach. It is built from `getBrands()`, the same query
 * the homepage strip uses, so a brand added from the dashboard appears here
 * with no further work.
 *
 * Each card is an entry into the catalogue rather than a brand page of its
 * own: `/products?brand=<slug>` already filters, sorts and paginates, and a
 * second implementation of that would be the thing that drifts.
 */
export default async function BrandsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('brands');
  const brands = await getBrands();
  const isAr = locale === 'ar';

  return (
    <div className="container-page py-8 sm:py-12">
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t('title')}</h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        {t('intro')}
      </p>

      {brands.length === 0 ? (
        <p className="mt-10 rounded-card border border-border bg-surface p-8 text-center text-sm text-muted">
          {t('empty')}
        </p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {brands.map((brand) => (
            <li key={brand.slug} className="flex">
              <Link
                href={`/products?brand=${brand.slug}`}
                className="flex w-full flex-col items-center gap-3 rounded-card border border-border bg-surface p-6 transition-colors hover:border-border-strong"
              >
                {/*
                  The brand's colour as a small identity dot, which is the only
                  place it is ever allowed (§10). `--color-muted` covers a brand
                  that has no colour set yet.
                */}
                <span
                  className="size-8 rounded-full"
                  style={{ backgroundColor: brand.accentColor ?? 'var(--color-muted)' }}
                  aria-hidden="true"
                />
                <span className="text-center text-sm font-semibold text-ink">
                  {isAr ? brand.nameAr : brand.nameEn}
                </span>
                <span className="text-xs text-muted numeric">
                  {t('productCount', { count: brand._count.products })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
