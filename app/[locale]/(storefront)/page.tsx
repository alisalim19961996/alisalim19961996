import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft, ArrowRight, ShieldCheck, Truck, BadgeCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/i18n/routing';

/**
 * Phase 1 homepage: hero plus trust strip.
 *
 * This is the design system proving itself in both directions, not the finished
 * homepage — featured products, brands, categories and educational content are
 * built in Phase 2 once the catalogue exists.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tNav] = await Promise.all([
    getTranslations('home'),
    getTranslations('nav'),
  ]);

  const isRtl = (locale as Locale) === 'ar';
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  return (
    <>
      <section className="border-b border-border bg-surface">
        <div className="container-page grid gap-12 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
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

          {/*
            Product photography lands here in Phase 2. Rather than ship a fake
            phone render, this holds the exact 4:5 frame the real image will
            occupy, so the layout does not shift when it arrives.
          */}
          <div
            className="relative aspect-[4/5] w-full max-w-md justify-self-center rounded-[--radius-panel] border border-border bg-canvas lg:justify-self-end"
            aria-hidden="true"
          >
            <div className="absolute inset-0 grid place-items-center">
              <span className="text-xs font-medium tracking-widest text-subtle uppercase">
                {tNav('products')}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-12">
        <ul className="grid gap-6 sm:grid-cols-3">
          <TrustItem
            icon={<BadgeCheck />}
            title={isRtl ? 'أجهزة أصلية' : 'Genuine devices'}
            body={
              isRtl
                ? 'كل جهاز يصلك بحالته الأصلية وبمواصفات معلنة بوضوح.'
                : 'Every device arrives sealed, with specifications stated plainly.'
            }
          />
          <TrustItem
            icon={<ShieldCheck />}
            title={isRtl ? 'ضمان واضح' : 'A clear warranty'}
            body={
              isRtl
                ? 'مدة الضمان وشروطه مكتوبة على صفحة كل منتج، بدون مفاجآت.'
                : 'Warranty length and terms are written on every product page.'
            }
          />
          <TrustItem
            icon={<Truck />}
            title={isRtl ? 'توصيل لكل العراق' : 'Delivered across Iraq'}
            body={
              isRtl
                ? 'أجور التوصيل ومدته معروفة قبل ما تأكد الطلب.'
                : 'Delivery cost and timing are shown before you confirm.'
            }
          />
        </ul>
      </section>
    </>
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
