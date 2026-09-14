import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CategoryForm } from '@/features/admin/components/category-form';
import {
  getAdminCategories,
  getAdminCategory,
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
  return { title: t('editCategory'), robots: { index: false, follow: false } };
}

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [category, { categories }, rows] = await Promise.all([
    getAdminCategory(id),
    getTaxonomyReference(),
    getAdminCategories(),
  ]);
  if (!category) notFound();

  const row = rows.find((entry) => entry.id === id);

  return (
    <CategoryForm
      category={category}
      categories={categories}
      locale={locale}
      productCount={row?.productCount ?? 0}
      childCount={row?.childCount ?? 0}
    />
  );
}
