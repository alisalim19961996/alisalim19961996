import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Cable,
  ShieldCheck,
  Smartphone,
  Tablet,
  Truck,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ProductCard } from '@/features/product/components/product-card';
import { cn } from '@/lib/utils';
import {
  getBestSellerRail,
  getBrands,
  getProductRail,
  getProductTypes,
} from '@/server/queries/catalogue';
import { getPriceRange } from '@/server/queries/site';
import { priceBands } from '@/lib/domain/price-bands';
import { formatIqd } from '@/lib/money';
import type { Locale } from '@/i18n/routing';
import { RAIL_SIZE } from '@/config/ui';

/**
 * Homepage.
 *
 * Ordered by what a first-time visitor needs to decide, not by what the store
 * wants to say: what is this and can I trust it (hero + trust), what do you
 * sell (types), what is good (featured), who do you carry (brands), what is new.
 *
 * Every rail is a real database read. Sections with nothing behind them do not
 * render at all rather than showing an empty shelf.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tCommon, featured, newArrivals, bestSellers, brands, types, range] =
    await Promise.all([
      getTranslations('home'),
      getTranslations('common'),
      getProductRail('isFeatured', RAIL_SIZE),
      getProductRail('isNewArrival', RAIL_SIZE),
      // Real deliveries, not a flag somebody ticked: a section headed "best
      // sellers" is a claim about what customers bought (§13.12).
      getBestSellerRail(RAIL_SIZE),
      // Only brands with something to sell — a shortcut to an empty catalogue
      // is a dead end. `/brands` still lists every one of them.
      getBrands({ withProductsOnly: true }),
      getProductTypes(),
      getPriceRange(),
    ]);

  const isRtl = (locale as Locale) === 'ar';
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  const typeIcons: Record<string, React.ReactNode> = {
    phone: <Smartphone />,
    tablet: <Tablet />,
    accessory: <Cable />,
  };

  /*
    Budget brackets computed from the catalogue's real minimum and maximum, by
    the same pure function `/guides` uses. Not a recommendation engine and not
    a claim about value: three links into filters that already exist, which is
    the question a phone shopper actually opens with.
  */
  const bands = range ? priceBands(range.min, range.max, 3) : [];

  return (
    <>
      {/* ------------------------------------------------------------- hero */}
      <section className="border-b border-border bg-surface">
        <div className="container-page grid gap-10 py-8 lg:grid-cols-2 lg:items-center lg:py-14">
          <div className="max-w-xl">
            <h1 className="text-hero font-bold text-ink">{t('heroTitle')}</h1>
            <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
              {t('heroSubtitle')}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/products">
                  {t('heroCta')}
                  <Arrow aria-hidden="true" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/guides">{t('heroCtaSecondary')}</Link>
              </Button>
            </div>

            {/*
              Types as chips rather than three large cards. The cards repeated
              the header's own links at the size of a hero image and pushed
              every product below the fold on a laptop; the same links this
              size leave the first screen for what is actually being sold.
            */}
            <ul className="mt-6 flex flex-wrap gap-2">
              {types.map((type) => (
                <li key={type.key}>
                  <Link
                    href={`/products?type=${type.key}`}
                    className="inline-flex items-center gap-2 rounded-control border border-border bg-canvas px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-border-strong hover:bg-surface [&_svg]:size-4"
                  >
                    {typeIcons[type.key] ?? <Smartphone />}
                    {isRtl ? type.nameAr : type.nameEn}
                    <span className="text-xs text-subtle numeric">
                      {type._count.products}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* --------------------------------------------- shop by budget */}
          {bands.length > 0 && (
            <div className="rounded-panel border border-border bg-canvas p-5 lg:justify-self-end lg:p-6">
              <h2 className="text-sm font-semibold text-ink">{t('budgetTitle')}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {t('budgetHint')}
              </p>
              <ul className="mt-4 space-y-2">
                {bands.map((band) => (
                  <li key={`${band.min}-${band.max ?? 'up'}`}>
                    <Link
                      href={
                        band.max === null
                          ? `/products?min=${band.min}`
                          : `/products?min=${band.min}&max=${band.max}`
                      }
                      className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface px-3.5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-border-strong"
                    >
                      <span className="numeric">
                        {band.max === null
                          ? t('budgetFrom', {
                              min: formatIqd(band.min, locale as Locale),
                            })
                          : t('budgetRange', {
                              min: formatIqd(band.min, locale as Locale),
                              max: formatIqd(band.max, locale as Locale),
                            })}
                      </span>
                      <Arrow
                        className="size-4 shrink-0 text-subtle"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------ trust */}
      <section className="border-b border-border bg-canvas">
        <ul className="container-page grid gap-6 py-10 sm:grid-cols-3">
          <TrustItem
            icon={<BadgeCheck />}
            title={t('trustGenuineTitle')}
            body={t('trustGenuineBody')}
            href="/about"
            linkLabel={t('trustGenuineLink')}
          />
          <TrustItem
            icon={<ShieldCheck />}
            title={t('trustWarrantyTitle')}
            body={t('trustWarrantyBody')}
            href="/about"
            linkLabel={t('trustWarrantyLink')}
          />
          <TrustItem
            icon={<Truck />}
            title={t('trustDeliveryTitle')}
            body={t('trustDeliveryBody')}
            href="/about"
            linkLabel={t('trustDeliveryLink')}
          />
        </ul>
      </section>

      {/* ----------------------------------------------------------- rails */}
      <ProductRail
        title={t('featured')}
        href="/products"
        linkLabel={tCommon('viewAll')}
        products={featured}
        priority
      />

      {/* ---------------------------------------------------------- brands */}
      {brands.length > 0 && (
        <section className="container-page py-4">
          <h2 className="mb-5 text-lg font-bold text-ink sm:text-xl">
            {t('shopByBrand')}
          </h2>
          {/* auto-fit rather than a fixed column count: with seven brands the
              six-column grid left the seventh alone on its own row. */}
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
            {brands.map((brand) => (
              <li key={brand.slug}>
                <Link
                  href={`/products?brand=${brand.slug}`}
                  className="flex h-full flex-col items-center justify-center gap-2 rounded-card border border-border bg-surface px-3 py-5 transition-colors hover:border-border-strong"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{
                      backgroundColor: brand.accentColor ?? 'var(--color-muted)',
                    }}
                    aria-hidden="true"
                  />
                  <span className="text-center text-sm font-medium text-ink">
                    {isRtl ? brand.nameAr : brand.nameEn}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ProductRail
        title={t('newArrivals')}
        href="/products?sort=newest"
        linkLabel={tCommon('viewAll')}
        products={newArrivals}
      />

      {/* Nothing delivered yet means no best sellers — an empty shelf under
          that heading would be the shop inventing a sales figure (§13.12). */}
      {bestSellers.length > 0 && (
        <ProductRail
          title={t('bestSellers')}
          href="/products?sort=best_selling"
          linkLabel={tCommon('viewAll')}
          products={bestSellers}
        />
      )}

      {/* ------------------------------------------------------- final CTA */}
      <section className="container-page pt-6 pb-16">
        <div className="rounded-panel bg-ink px-6 py-12 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            {t('finalCtaTitle')}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/70">
            {t('finalCtaBody')}
          </p>
          {/*
            Not a second copy of the hero's browse button: somebody who has
            scrolled the whole page past three rails has already seen the
            catalogue. What they have not seen is a way to ask.
          */}
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/guides">
                {t('finalCtaGuides')}
                <Arrow aria-hidden="true" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/contact">{t('finalCtaContact')}</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

async function ProductRail({
  title,
  href,
  linkLabel,
  products,
  priority = false,
}: {
  title: string;
  href: string;
  linkLabel: string;
  products: Awaited<ReturnType<typeof getProductRail>>;
  priority?: boolean;
}) {
  if (products.length === 0) return null;

  return (
    <section className="container-page py-10">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-bold text-ink sm:text-xl">{title}</h2>
        <Link
          href={href}
          className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {linkLabel}
        </Link>
      </div>

      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
        {products.map((product, index) => (
          <li
            key={product.id}
            /*
              `cn()`, not a template literal: `hidden` and `flex` are both
              display utilities, so a plain string leaves CSS source order to
              decide which wins — the mistake that once left thirteen controls
              in the phone header.

              The fifth card exists only where there is a fifth column. Below
              `xl` the grid is four wide, so showing it would leave one card
              alone on a second row.
            */
            className={cn('flex', index >= 4 && 'hidden xl:flex')}
          >
            <ProductCard product={product} priority={priority && index < 2} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One trust claim, and where to go and check it.
 *
 * A promise with nowhere to read the detail is a slogan. Each of the three now
 * carries a link to the page that actually says something — the delivery fee
 * table's own explanation, the warranty terms — so the bar answers "how do you
 * know?" instead of asserting it.
 */
function TrustItem({
  icon,
  title,
  body,
  href,
  linkLabel,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  href: '/about' | '/contact' | '/guides';
  linkLabel: string;
}) {
  return (
    <li className="flex gap-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary [&_svg]:size-5">
        {icon}
      </span>
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
        <Link
          href={href}
          className="mt-1.5 inline-block text-xs font-medium text-ink underline underline-offset-2 hover:text-primary"
        >
          {linkLabel}
        </Link>
      </div>
    </li>
  );
}
