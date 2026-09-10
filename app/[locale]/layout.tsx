import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import { routing, localeDirection, type Locale } from '@/i18n/routing';
import { publicEnv } from '@/config/env';
import '../globals.css';

/**
 * Fonts are self-hosted by next/font at build time: no request to a third-party
 * CDN, no FOIT, and no layout shift when the font swaps in. IBM Plex Sans
 * Arabic is a genuinely designed Arabic typeface rather than a Latin face with
 * Arabic bolted on, which is where most bilingual stores start to look cheap.
 */
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

const latin = Inter({
  subsets: ['latin'],
  variable: '--font-latin',
  display: 'swap',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'brand' });

  return {
    metadataBase: new URL(publicEnv.NEXT_PUBLIC_APP_URL),
    title: {
      default: `${t('fullName')} — ${t('name')}`,
      template: `%s | ${t('name')}`,
    },
    description: t('tagline'),
    alternates: {
      canonical: `/${locale}`,
      languages: {
        ar: '/ar',
        en: '/en',
        'x-default': '/ar',
      },
    },
    openGraph: {
      type: 'website',
      siteName: t('name'),
      locale: locale === 'ar' ? 'ar_IQ' : 'en_US',
    },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Required for static rendering of a locale-segmented tree.
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'common' });
  const direction = localeDirection[locale as Locale];

  return (
    <html
      lang={locale}
      dir={direction}
      className={`${arabic.variable} ${latin.variable}`}
      // globals.css sets scroll-behavior: smooth; this tells Next to suppress
      // it during route transitions, which otherwise animate the scroll reset.
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-[--radius-control] focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
