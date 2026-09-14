import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { formatIqd } from '@/lib/money';
import { priceBands } from '@/lib/domain/price-bands';
import { buildAlternates } from '@/lib/seo';
import { getBrands, getProductTypes } from '@/server/queries/catalogue';
import { getPriceRange } from '@/server/queries/site';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'guides' });
  return {
    title: t('title'),
    description: t('intro'),
    alternates: buildAlternates('/guides', locale),
  };
}

/**
 * How to choose — built entirely from what the shop actually sells.
 *
 * Deliberately not articles. A guides page backed by a blog table nobody can
 * write into is a permanently empty page, and buying advice written here would
 * be a commercial claim living in code (§13.12, §13.13). Every entry point
 * below is a real product type, a real brand, or a budget bracket computed
 * from the real minimum and maximum price, and each one lands on the catalogue
 * where the filtering already works.
 */
export default async function GuidesPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('guides');
  const [types, brands, range] = await Promise.all([
    getProductTypes(),
    getBrands(),
    getPriceRange(),
  ]);

  const isAr = locale === 'ar';
  const bands = range ? priceBands(range.min, range.max, 3) : [];

  return (
    <div className="container-page py-8 sm:py-12">
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t('title')}</h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        {t('intro')}
      </p>

      <div className="mt-10 space-y-10">
        {types.length > 0 && (
          <Section title={t('byType')} hint={t('byTypeHint')}>
            {types.map((type) => (
              <Entry
                key={type.key}
                href={`/products?type=${type.key}`}
                label={isAr ? type.nameAr : type.nameEn}
                meta={t('productCount', { count: type._count.products })}
              />
            ))}
          </Section>
        )}

        {bands.length > 1 && (
          <Section title={t('byBudget')} hint={t('byBudgetHint')}>
            {bands.map((band) => (
              <Entry
                key={`${band.min}-${band.max ?? 'top'}`}
                href={
                  band.max === null
                    ? `/products?min=${band.min}`
                    : `/products?min=${band.min}&max=${band.max}`
                }
                label={
                  band.max === null
                    ? t('bandFrom', { min: formatIqd(band.min, locale) })
                    : band.min === 0
                      ? t('bandUnder', { max: formatIqd(band.max, locale) })
                      : t('bandBetween', {
                          min: formatIqd(band.min, locale),
                          max: formatIqd(band.max, locale),
                        })
                }
              />
            ))}
          </Section>
        )}

        {brands.length > 0 && (
          <Section title={t('byBrand')} hint={t('byBrandHint')}>
            {brands.map((brand) => (
              <Entry
                key={brand.slug}
                href={`/products?brand=${brand.slug}`}
                label={isAr ? brand.nameAr : brand.nameEn}
                meta={t('productCount', { count: brand._count.products })}
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>
    </section>
  );
}

function Entry({ href, label, meta }: { href: string; label: string; meta?: string }) {
  return (
    <li className="flex">
      <Link
        href={href}
        className="flex w-full items-center gap-3 rounded-[--radius-card] border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong"
      >
        <span className="text-sm font-medium text-ink">{label}</span>
        {meta && <span className="text-xs text-muted numeric">{meta}</span>}
        <ArrowLeft
          className="ms-auto size-4 shrink-0 flip-rtl text-subtle"
          aria-hidden
        />
      </Link>
    </li>
  );
}
