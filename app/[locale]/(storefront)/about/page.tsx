import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BadgeCheck, Banknote, Truck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buildAlternates } from '@/lib/seo';
import { getPublicSiteSettings } from '@/server/queries/site';
import { GOVERNORATE_VALUES } from '@/schemas/checkout';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  return {
    title: t('title'),
    description: t('lead'),
    alternates: buildAlternates('/about', locale),
  };
}

/**
 * What this shop is and how buying from it works.
 *
 * The copy states only things that are true of the software as built — cash on
 * delivery, delivery to every governorate, prices in dinars — and no claim
 * about experience, volume or reputation, which would be invented data
 * (§13.12). The store's own name comes from `SiteSetting` so it stays the
 * owner's to change, and the governorate count is read from the enum rather
 * than typed, so it cannot drift from what checkout actually offers.
 */
export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('about');
  const settings = await getPublicSiteSettings();

  const storeName =
    (locale === 'ar' ? settings?.storeNameAr : settings?.storeNameEn) ?? 'MPS';

  const points = [
    {
      key: 'cod',
      icon: <Banknote aria-hidden />,
      title: t('codTitle'),
      body: t('codBody'),
    },
    {
      key: 'delivery',
      icon: <Truck aria-hidden />,
      title: t('deliveryTitle'),
      body: t('deliveryBody', { count: GOVERNORATE_VALUES.length }),
    },
    {
      key: 'warranty',
      icon: <BadgeCheck aria-hidden />,
      title: t('warrantyTitle'),
      body: t('warrantyBody'),
    },
  ];

  return (
    <div className="container-page py-8 sm:py-12">
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">
        {t('title', { store: storeName })}
      </h1>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-soft">
        {t('lead', { store: storeName })}
      </p>

      <ul className="mt-10 grid gap-6 sm:grid-cols-3">
        {points.map((point) => (
          <li
            key={point.key}
            className="rounded-card border border-border bg-surface p-6"
          >
            <span className="grid size-10 place-items-center rounded-full bg-primary-soft text-primary [&_svg]:size-5">
              {point.icon}
            </span>
            <h2 className="mt-4 text-sm font-semibold text-ink">{point.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{point.body}</p>
          </li>
        ))}
      </ul>

      <section className="mt-10 max-w-prose">
        <h2 className="text-lg font-bold text-ink">{t('howTitle')}</h2>
        <ol className="mt-4 space-y-3">
          {['browse', 'order', 'confirm', 'receive'].map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white numeric">
                {index + 1}
              </span>
              <span className="text-sm leading-relaxed text-muted">
                {t(`step_${step}`)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/products"
          className="inline-flex h-11 items-center rounded-control bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          {t('browseCta')}
        </Link>
        <Link
          href="/contact"
          className="inline-flex h-11 items-center rounded-control border border-border px-5 text-sm font-semibold text-ink transition-colors hover:border-border-strong"
        >
          {t('contactCta')}
        </Link>
      </div>
    </div>
  );
}
