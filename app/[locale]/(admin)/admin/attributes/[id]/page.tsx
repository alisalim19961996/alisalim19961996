import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AttributeForm } from '@/features/admin/components/attribute-form';
import {
  getAdminAttribute,
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
  return { title: t('editAttribute'), robots: { index: false, follow: false } };
}

export default async function EditAttributePage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [attribute, { groups }] = await Promise.all([
    getAdminAttribute(id),
    getTaxonomyReference(),
  ]);
  if (!attribute) notFound();

  return <AttributeForm attribute={attribute} groups={groups} locale={locale} />;
}
