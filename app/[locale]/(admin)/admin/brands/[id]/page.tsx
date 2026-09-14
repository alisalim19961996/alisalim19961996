import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BrandForm } from '@/features/admin/components/brand-form';
import { getAdminBrand, getAdminBrands } from '@/server/queries/admin-taxonomy';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('editBrand'), robots: { index: false, follow: false } };
}

export default async function EditBrandPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [brand, brands] = await Promise.all([getAdminBrand(id), getAdminBrands()]);
  if (!brand) notFound();

  const productCount = brands.find((row) => row.id === id)?.productCount ?? 0;

  return <BrandForm brand={brand} productCount={productCount} />;
}
