import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { ProductForm } from '@/features/admin/components/product-form';
import { isUploadConfigured } from '@/config/env';
import { getProductFormReference } from '@/server/queries/admin-products';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('newProduct'), robots: { index: false, follow: false } };
}

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, reference] = await Promise.all([
    getTranslations('admin'),
    getProductFormReference(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4 flip-rtl" aria-hidden />
          {t('products')}
        </Link>
        <h1 className="mt-2 text-xl font-bold text-ink">{t('newProduct')}</h1>
        <p className="mt-1 text-sm text-muted">{t('newProductHint')}</p>
      </div>

      <ProductForm
        product={null}
        reference={reference}
        locale={locale}
        uploadEnabled={isUploadConfigured}
      />
    </div>
  );
}
