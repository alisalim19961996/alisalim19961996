import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AttributeForm } from '@/features/admin/components/attribute-form';
import { getTaxonomyReference } from '@/server/queries/admin-taxonomy';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('newAttribute'), robots: { index: false, follow: false } };
}

export default async function NewAttributePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { groups } = await getTaxonomyReference();
  return <AttributeForm groups={groups} locale={locale} />;
}
