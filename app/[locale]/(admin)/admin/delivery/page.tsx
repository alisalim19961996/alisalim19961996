import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DeliveryRatesTable } from '@/features/admin/components/delivery-rates-table';
import { getDeliveryRates } from '@/server/services/admin-settings';
import { GOVERNORATE_VALUES } from '@/schemas/checkout';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('delivery'), robots: { index: false, follow: false } };
}

export default async function AdminDeliveryPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const rates = await getDeliveryRates();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">{t('delivery')}</h1>
        <p className="mt-1 text-sm text-muted">{t('deliveryHint')}</p>
      </div>

      <DeliveryRatesTable governorates={GOVERNORATE_VALUES} rates={rates} />
    </div>
  );
}
