import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAdminBrands } from '@/server/queries/admin-taxonomy';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('brands'), robots: { index: false, follow: false } };
}

/**
 * The brands, with the count of products behind each.
 *
 * The count is the column that matters: it is the answer to the only question
 * the owner asks before touching a brand, and it is why the delete control on
 * the edit page can explain itself instead of failing.
 */
export default async function AdminBrandsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const brands = await getAdminBrands();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{t('brands')}</h1>
          <p className="text-sm text-muted numeric">{brands.length}</p>
        </div>
        <Button asChild>
          <Link href="/admin/brands/new">
            <Plus aria-hidden />
            {t('newBrand')}
          </Link>
        </Button>
      </div>

      {brands.length === 0 ? (
        <p className="rounded-[--radius-card] border border-border bg-surface p-8 text-center text-sm text-muted">
          {t('noBrands')}
        </p>
      ) : (
        <ul className="space-y-2">
          {brands.map((brand) => (
            <li key={brand.id}>
              <Link
                href={`/admin/brands/${brand.id}`}
                className="flex flex-wrap items-center gap-3 rounded-[--radius-card] border border-border bg-surface p-4 transition-colors hover:border-border-strong"
              >
                {/*
                  The accent colour, as the small identity dot it is meant to
                  be (§10). It is per-row data, never a background.
                */}
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full border border-border"
                  style={
                    brand.accentColor
                      ? { backgroundColor: brand.accentColor }
                      : undefined
                  }
                />
                <span className="font-medium text-ink">
                  {locale === 'ar' ? brand.nameAr : brand.nameEn}
                </span>
                <span className="text-xs text-subtle numeric">{brand.slug}</span>
                {!brand.isActive && <Badge variant="neutral">{t('inactive')}</Badge>}
                <span className="ms-auto text-sm text-muted numeric">
                  {t('productCount', { count: brand.productCount })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
