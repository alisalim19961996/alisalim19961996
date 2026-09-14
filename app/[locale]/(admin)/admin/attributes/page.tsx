import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAdminAttributes } from '@/server/queries/admin-taxonomy';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('attributes'), robots: { index: false, follow: false } };
}

/**
 * Every specification the catalogue knows about.
 *
 * Shared across product types on purpose — one "RAM" row, required on phones
 * and optional on tablets — which is why the count of product types using it
 * and the count of values stored against it are both on the row: they are
 * what makes a change here safe or unsafe.
 */
export default async function AdminAttributesPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const attributes = await getAdminAttributes();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{t('attributes')}</h1>
          <p className="text-sm text-muted">{t('attributesHint')}</p>
        </div>
        <Button asChild>
          <Link href="/admin/attributes/new">
            <Plus aria-hidden />
            {t('newAttribute')}
          </Link>
        </Button>
      </div>

      {attributes.length === 0 ? (
        <p className="rounded-[--radius-card] border border-border bg-surface p-8 text-center text-sm text-muted">
          {t('noAttributes')}
        </p>
      ) : (
        <ul className="space-y-2">
          {attributes.map((attribute) => (
            <li key={attribute.id}>
              <Link
                href={`/admin/attributes/${attribute.id}`}
                className="flex flex-wrap items-center gap-3 rounded-[--radius-card] border border-border bg-surface p-4 transition-colors hover:border-border-strong"
              >
                <span className="font-medium text-ink">
                  {locale === 'ar' ? attribute.labelAr : attribute.labelEn}
                </span>
                {attribute.unit && (
                  <span className="text-xs text-muted numeric">{attribute.unit}</span>
                )}
                <span className="text-xs text-subtle numeric">{attribute.key}</span>
                <Badge variant="neutral">{t(`attributeType_${attribute.type}`)}</Badge>
                {attribute.isFilterable && <Badge>{t('filterable')}</Badge>}
                <span className="ms-auto flex flex-wrap items-center gap-3 text-sm text-muted numeric">
                  <span>{t('usedByTypes', { count: attribute.typeCount })}</span>
                  <span>{t('storedValues', { count: attribute.valueCount })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
