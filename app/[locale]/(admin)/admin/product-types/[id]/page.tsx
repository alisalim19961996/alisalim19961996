import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ProductTypeForm } from '@/features/admin/components/product-type-form';
import {
  getAdminProductType,
  getAdminProductTypes,
  getTaxonomyReference,
} from '@/server/queries/admin-taxonomy';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('editProductType'), robots: { index: false, follow: false } };
}

export default async function EditProductTypePage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [productType, { attributes }, rows] = await Promise.all([
    getAdminProductType(id),
    getTaxonomyReference(),
    getAdminProductTypes(),
  ]);
  if (!productType) notFound();

  return (
    <ProductTypeForm
      productType={productType}
      attributes={attributes}
      locale={locale}
      productCount={rows.find((row) => row.id === id)?.productCount ?? 0}
    />
  );
}
