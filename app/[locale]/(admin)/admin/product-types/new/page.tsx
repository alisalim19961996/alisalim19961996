import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ProductTypeForm } from '@/features/admin/components/product-type-form';
import { getTaxonomyReference } from '@/server/queries/admin-taxonomy';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('newProductType'), robots: { index: false, follow: false } };
}

export default async function NewProductTypePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { attributes } = await getTaxonomyReference();
  return <ProductTypeForm attributes={attributes} locale={locale} />;
}
