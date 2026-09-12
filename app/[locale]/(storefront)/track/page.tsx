import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TrackForm } from '@/features/order/components/track-form';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'order' });
  // The form itself is worth indexing — customers search for "track my order"
  // — even though everything behind it is private.
  return { title: t('trackTitle') };
}

export default async function TrackPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('order');

  return (
    <main className="container-page py-12 sm:py-16">
      <h1 className="text-center text-2xl font-bold text-ink sm:text-3xl">
        {t('trackTitle')}
      </h1>
      <div className="mt-8">
        <TrackForm />
      </div>
    </main>
  );
}
