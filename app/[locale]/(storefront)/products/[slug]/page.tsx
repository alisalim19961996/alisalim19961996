import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronLeft, ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { ProductGallery } from '@/features/product/components/product-gallery';
import { ProductPurchase } from '@/features/product/components/product-purchase';
import { WishlistButton } from '@/features/wishlist/components/wishlist-button';
import { ReviewSection } from '@/features/review/components/review-section';
import { ProductCard } from '@/features/product/components/product-card';
import {
  buildSpecGroups,
  getAllProductSlugs,
  getProductBySlug,
  getRelatedProducts,
} from '@/server/queries/product';
import { getProductReviews, getReviewSummary } from '@/server/queries/review';
import { publicEnv } from '@/config/env';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { jsonLdScript } from '@/lib/seo';
import { GOVERNORATE_VALUES } from '@/schemas/checkout';
import {
  KeyFeatureList,
  PointList,
  Section,
} from '@/features/product/components/product-content';

/**
 * Product detail.
 *
 * Rendered on the server and pre-generated per slug, so the page a shopper
 * lands on from search is HTML, not a spinner. The only client-side parts are
 * variant selection, the gallery and the mobile buy bar.
 */

export async function generateStaticParams() {
  const slugs = await getAllProductSlugs();
  return routing.locales.flatMap((locale) =>
    slugs.map(({ slugEn }) => ({ locale, slug: slugEn })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) return {};

  const isAr = locale === 'ar';
  const name = isAr ? product.nameAr : product.nameEn;
  const description =
    (isAr ? product.metaDescriptionAr : product.metaDescriptionEn) ??
    (isAr ? product.overviewAr : product.overviewEn) ??
    (isAr ? product.taglineAr : product.taglineEn) ??
    name;

  const image = product.images[0];

  return {
    title: (isAr ? product.metaTitleAr : product.metaTitleEn) ?? name,
    description,
    alternates: {
      canonical: `/${locale}/products/${product.slugEn}`,
      languages: {
        ar: `/ar/products/${product.slugAr}`,
        en: `/en/products/${product.slugEn}`,
      },
    },
    openGraph: {
      type: 'website',
      title: name,
      description,
      images: image ? [{ url: image.url, width: 1000, height: 1250 }] : undefined,
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const t = await getTranslations('product');
  const isAr = (locale as Locale) === 'ar';

  const name = isAr ? product.nameAr : product.nameEn;
  const tagline = isAr ? product.taglineAr : product.taglineEn;
  const overview = isAr ? product.overviewAr : product.overviewEn;
  const pros = isAr ? product.prosAr : product.prosEn;
  const cons = isAr ? product.consAr : product.consEn;
  const whoIsItFor = isAr ? product.whoIsItForAr : product.whoIsItForEn;
  /*
    Three things the dashboard has always saved and the page never showed: the
    key features, the warranty's own note, and "things to know". They belong
    beside the buy decision rather than at the bottom — a warranty note that
    qualifies the months is useless below the specifications table.
  */
  const keyFeatures = isAr ? product.keyFeaturesAr : product.keyFeaturesEn;
  const warrantyNote = isAr ? product.warrantyNoteAr : product.warrantyNoteEn;
  const thingsToKnow = isAr ? product.thingsToKnowAr : product.thingsToKnowEn;
  const brandName = isAr ? product.brand.nameAr : product.brand.nameEn;

  // Which rows this table has is decided by the product's type, not by this
  // file: a tablet shows stylus support and no NFC, a cable shows neither.
  const specGroups = buildSpecGroups(product, locale as Locale);

  const [summary, reviews] = await Promise.all([
    getReviewSummary(product.id),
    getProductReviews(product.id),
  ]);

  const related = await getRelatedProducts(
    product.id,
    product.productType.key,
    product.minPriceIqd,
  );

  const pickerVariants = product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    labelAr: variant.labelAr,
    labelEn: variant.labelEn,
    priceIqd: variant.priceIqd,
    comparePriceIqd: variant.comparePriceIqd,
    optionValueIds: variant.optionValues.map((link) => link.optionValueId),
    inventory: variant.inventory,
  }));

  return (
    <>
      <ProductJsonLd
        product={product}
        locale={locale as Locale}
        name={name}
        description={overview ?? tagline ?? name}
      />

      <div className="container-page py-6 lg:py-10">
        <Breadcrumb
          items={[
            { label: t('allProducts'), href: '/products' },
            { label: brandName, href: `/products?brand=${product.brand.slug}` },
            { label: name },
          ]}
        />

        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,45%)_minmax(0,1fr)] lg:gap-14">
          <ProductGallery
            images={product.images}
            videos={product.videos}
            productName={name}
          />

          <div className="min-w-0">
            <p className="text-sm font-medium text-muted">{brandName}</p>
            <h1 className="mt-1 text-2xl leading-tight font-bold text-ink sm:text-3xl">
              {name}
            </h1>
            {tagline && <p className="mt-2 text-base text-muted">{tagline}</p>}

            <div className="mt-7">
              <ProductPurchase
                options={product.options}
                variants={pickerVariants}
                name={name}
                slug={product.slugEn}
                governorates={GOVERNORATE_VALUES}
                warranty={
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
                    <div>
                      <dt className="text-xs text-subtle">{t('warranty')}</dt>
                      <dd className="font-medium text-ink">
                        {t('warrantyMonths', { count: product.warrantyMonths })}
                      </dd>
                      {/* The product's own note qualifies the months, so it
                          sits under them rather than in a section nobody
                          scrolls to. */}
                      {warrantyNote && (
                        <dd className="mt-0.5 text-xs leading-relaxed text-muted">
                          {warrantyNote}
                        </dd>
                      )}
                    </div>
                  </div>
                }
              />
            </div>

            {/*
              Below the buy controls, not beside them: red is reserved for the
              primary action on a screen (§10), and a heart competing with
              add-to-cart would be the second thing asking to be pressed.
            */}
            <div className="mt-3">
              <WishlistButton productId={product.id} variant="labelled" />
            </div>

            <KeyFeatureList features={keyFeatures} />
          </div>
        </div>

        {/*
          Editorial content first, at full width, then the specifications.

          The two used to sit side by side, a tall narrow specification column
          against short prose — which §15 carried as "whitespace on sparse
          products" and which is really the wrong shape: a 380px column makes a
          twenty-row table twice as long as it needs to be, and leaves the
          content beside it ending halfway up. One column each, in order.
        */}
        <div className="mt-14 space-y-14">
          <div className="max-w-3xl space-y-12">
            {overview && (
              <Section title={t('overview')}>
                <p className="text-[15px] leading-relaxed text-muted">{overview}</p>
              </Section>
            )}

            {(pros.length > 0 || cons.length > 0) && (
              <Section title={t('prosAndCons')}>
                <div className="grid gap-6 sm:grid-cols-2">
                  <PointList title={t('pros')} points={pros} tone="pro" />
                  <PointList title={t('cons')} points={cons} tone="con" />
                </div>
              </Section>
            )}

            {whoIsItFor && (
              <Section title={t('whoIsItFor')}>
                <p className="text-[15px] leading-relaxed text-muted">{whoIsItFor}</p>
              </Section>
            )}

            {thingsToKnow && (
              <Section title={t('thingsToKnow')}>
                <p className="text-[15px] leading-relaxed whitespace-pre-line text-muted">
                  {thingsToKnow}
                </p>
              </Section>
            )}
          </div>

          {specGroups.length > 0 && (
            <Section title={t('specifications')}>
              {/*
                Groups beside each other where there is room. Each is a small
                self-contained table, so two columns halve the page's length
                without making any single row harder to read; one column on a
                phone, where side by side would mean four words per line.
              */}
              <div className="grid gap-4 md:grid-cols-2">
                {specGroups.map((group) => (
                  <div
                    key={group.key}
                    className="rounded-card border border-border bg-surface p-4"
                  >
                    <h3 className="mb-3 text-xs font-semibold tracking-wide text-subtle uppercase">
                      {group.name}
                    </h3>
                    <dl className="space-y-2">
                      {group.rows.map((row) => (
                        <div
                          key={row.key}
                          className="flex items-baseline justify-between gap-4 text-sm"
                        >
                          <dt className="text-muted">{row.label}</dt>
                          <dd className="text-end font-medium text-ink numeric">
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        <ReviewSection
          productId={product.id}
          productSlug={product.slugEn}
          summary={summary}
          reviews={reviews}
        />

        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="mb-5 text-lg font-bold text-ink">{t('related')}</h2>
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {related.map((item) => (
                <li key={item.id} className="flex">
                  <ProductCard product={item} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function Breadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
        {items.map((item, index) => (
          <li key={item.label} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronLeft className="size-3 flip-rtl text-subtle" aria-hidden="true" />
            )}
            {item.href ? (
              <Link href={item.href} className="hover:text-ink">
                {item.label}
              </Link>
            ) : (
              <span className="text-ink">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Product structured data.
 *
 * `offers` reports the real price and availability, because a rich result that
 * disagrees with the page is worse than no rich result. AggregateRating is
 * deliberately absent until there are real reviews to aggregate.
 */
function ProductJsonLd({
  product,
  locale,
  name,
  description,
}: {
  product: Awaited<ReturnType<typeof getProductBySlug>>;
  locale: Locale;
  name: string;
  description: string;
}) {
  if (!product) return null;

  const base = publicEnv.NEXT_PUBLIC_APP_URL;
  const image = product.images[0];
  const inStock = product.variants.some(
    (variant) => variant.inventory?.status === 'IN_STOCK',
  );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    sku: product.variants[0]?.sku,
    brand: {
      '@type': 'Brand',
      name: locale === 'ar' ? product.brand.nameAr : product.brand.nameEn,
    },
    image: image ? [`${base}${image.url}`] : undefined,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'IQD',
      lowPrice: product.minPriceIqd ?? undefined,
      highPrice: product.variants.reduce(
        (max, variant) => Math.max(max, variant.priceIqd),
        0,
      ),
      offerCount: product.variants.length,
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: `${base}/${locale}/products/${product.slugEn}`,
    },
  };

  return (
    <script
      type="application/ld+json"
      /*
        `jsonLdScript`, not `JSON.stringify`: the rows are typed by staff in
        the dashboard now, and stringify leaves `</script>` intact. See
        lib/seo.ts for what that depends on today and why it should not.
      */
      dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
    />
  );
}
