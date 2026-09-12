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
import { getBrands, getProductRail, getProductTypes } from '@/server/queries/catalogue';
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

  const [t, tCommon, featured, newArrivals, bestSellers, brands, types] =
    await Promise.all([
      getTranslations('home'),
      getTranslations('common'),
      getProductRail('isFeatured', RAIL_SIZE),
      getProductRail('isNewArrival', RAIL_SIZE),
      getProductRail('isBestSeller', RAIL_SIZE),
      getBrands(),
      getProductTypes(),
    ]);

  const isRtl = (locale as Locale) === 'ar';
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  const typeIcons: Record<string, React.ReactNode> = {
    phone: <Smartphone />,
    tablet: <Tablet />,
    accessory: <Cable />,
  };

  return (
    <>
      {/* ------------------------------------------------------------- hero */}
      <section className="border-b border-border bg-surface">
        <div className="container-page grid gap-10 py-14 lg:grid-cols-2 lg:items-center lg:py-20">
          <div className="max-w-xl">
            <h1 className="text-4xl leading-tight font-bold text-ink sm:text-5xl lg:text-6xl">
              {t('heroTitle')}
            </h1>
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
          </div>

          {/* Shop-by-type tiles double as the hero's visual weight, which keeps
              the first screen useful instead of decorative. */}
          <ul className="grid grid-cols-3 gap-3 lg:justify-self-end">
            {types.map((type) => (
              <li key={type.key}>
                <Link
                  href={`/products?type=${type.key}`}
                  className="flex h-full flex-col items-center gap-3 rounded-[--radius-panel] border border-border bg-canvas p-5 text-center transition-colors hover:border-border-strong hover:bg-surface"
                >
                  <span className="grid size-11 place-items-center rounded-full bg-surface text-ink [&_svg]:size-5">
                    {typeIcons[type.key] ?? <Smartphone />}
                  </span>
                  <span className="text-sm font-semibold text-ink">
                    {isRtl ? type.nameAr : type.nameEn}
                  </span>
                  <span className="text-xs text-subtle numeric">
                    {type._count.products}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------ trust */}
      <section className="border-b border-border bg-canvas">
        <ul className="container-page grid gap-6 py-10 sm:grid-cols-3">
          <TrustItem
            icon={<BadgeCheck />}
            title={t('trustGenuineTitle')}
            body={t('trustGenuineBody')}
          />
          <TrustItem
            icon={<ShieldCheck />}
            title={t('trustWarrantyTitle')}
            body={t('trustWarrantyBody')}
          />
          <TrustItem
            icon={<Truck />}
            title={t('trustDeliveryTitle')}
            body={t('trustDeliveryBody')}
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
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {brands.map((brand) => (
              <li key={brand.slug}>
                <Link
                  href={`/products?brand=${brand.slug}`}
                  className="flex h-full flex-col items-center justify-center gap-2 rounded-[--radius-card] border border-border bg-surface px-3 py-5 transition-colors hover:border-border-strong"
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

      <ProductRail
        title={t('bestSellers')}
        href="/products?sort=best_selling"
        linkLabel={tCommon('viewAll')}
        products={bestSellers}
      />

      {/* ------------------------------------------------------- final CTA */}
      <section className="container-page pt-6 pb-16">
        <div className="rounded-[--radius-panel] bg-ink px-6 py-12 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            {t('finalCtaTitle')}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/70">
            {t('finalCtaBody')}
          </p>
          <Button size="lg" className="mt-7" asChild>
            <Link href="/products">
              {t('heroCta')}
              <Arrow aria-hidden="true" />
            </Link>
          </Button>
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

      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((product, index) => (
          <li key={product.id} className="flex">
            <ProductCard product={product} priority={priority && index < 2} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TrustItem({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary [&_svg]:size-5">
        {icon}
      </span>
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </li>
  );
}
