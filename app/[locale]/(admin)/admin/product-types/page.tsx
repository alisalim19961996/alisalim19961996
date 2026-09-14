import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAdminProductTypes } from '@/server/queries/admin-taxonomy';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('productTypes'), robots: { index: false, follow: false } };
}

/**
 * The product types, each with how many specifications it asks for.
 *
 * That second number is the point of the screen: a type with no attributes
 * produces a product page with an empty specification table, and there is
 * nothing on the product form to say why.
 */
export default async function AdminProductTypesPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const types = await getAdminProductTypes();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{t('productTypes')}</h1>
          <p className="text-sm text-muted">{t('productTypesHint')}</p>
        </div>
        <Button asChild>
          <Link href="/admin/product-types/new">
            <Plus aria-hidden />
            {t('newProductType')}
          </Link>
        </Button>
      </div>

      {types.length === 0 ? (
        <p className="rounded-[--radius-card] border border-border bg-surface p-8 text-center text-sm text-muted">
          {t('noProductTypes')}
        </p>
      ) : (
        <ul className="space-y-2">
          {types.map((type) => (
            <li key={type.id}>
              <Link
                href={`/admin/product-types/${type.id}`}
                className="flex flex-wrap items-center gap-3 rounded-[--radius-card] border border-border bg-surface p-4 transition-colors hover:border-border-strong"
              >
                <span className="font-medium text-ink">
                  {locale === 'ar' ? type.nameAr : type.nameEn}
                </span>
                <span className="text-xs text-subtle numeric">{type.key}</span>
                {!type.isActive && <Badge variant="neutral">{t('inactive')}</Badge>}
                <span className="ms-auto flex flex-wrap items-center gap-3 text-sm text-muted numeric">
                  <span>{t('attributeCount', { count: type.attributeCount })}</span>
                  <span>{t('productCount', { count: type.productCount })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
