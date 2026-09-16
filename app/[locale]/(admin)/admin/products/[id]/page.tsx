import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { ProductForm } from '@/features/admin/components/product-form';
import { isUploadConfigured } from '@/config/env';
import { ProductDeleteButton } from '@/features/admin/components/product-row-actions';
import {
  getProductForEdit,
  getProductFormReference,
} from '@/server/queries/admin-products';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  const product = await getProductForEdit(id);
  return {
    title: product
      ? locale === 'ar'
        ? product.nameAr
        : product.nameEn
      : t('products'),
    robots: { index: false, follow: false },
  };
}

/**
 * Edit one product.
 *
 * The delete control sits at the bottom, after everything else, and is
 * replaced by an explanation once the product has been sold — deleting it
 * would set `OrderItem.variantId` to null and quietly cut past invoices loose
 * from the row they were sold from.
 */
export default async function EditProductPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [t, product, reference] = await Promise.all([
    getTranslations('admin'),
    getProductForEdit(id),
    getProductFormReference(),
  ]);

  if (!product) notFound();

  const name = locale === 'ar' ? product.nameAr : product.nameEn;

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

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-ink">{name}</h1>
          <Link
            href={`/products/${product.slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
          >
            <ExternalLink className="size-4" aria-hidden />
            {t('viewOnStore')}
          </Link>
        </div>
      </div>

      <ProductForm
        product={product}
        reference={reference}
        locale={locale}
        uploadEnabled={isUploadConfigured}
      />

      <section className="rounded-card border border-danger-soft bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">{t('dangerZone')}</h2>
        <p className="mt-1 text-xs text-muted">{t('dangerZoneHint')}</p>
        <div className="mt-3">
          <ProductDeleteButton
            id={product.id}
            productName={name}
            hasOrders={product.soldVariantIds.length > 0}
          />
        </div>
      </section>
    </div>
  );
}
