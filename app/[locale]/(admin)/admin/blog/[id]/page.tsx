import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BlogPostForm } from '@/features/admin/components/blog-form';
import { getBlogPostForEdit } from '@/server/queries/admin-blog';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('editGuide'), robots: { index: false, follow: false } };
}

export default async function EditGuidePage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const post = await getBlogPostForEdit(id);
  if (!post) notFound();

  return <BlogPostForm post={post} />;
}
