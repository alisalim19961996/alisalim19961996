import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAdminCategories } from '@/server/queries/admin-taxonomy';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('categories'), robots: { index: false, follow: false } };
}

/**
 * The category tree, flattened with a depth per row.
 *
 * Indented by padding rather than by nesting lists: the tree is at most a few
 * levels deep, and a recursive component here would make the "which row am I
 * looking at" question harder, not easier.
 */
export default async function AdminCategoriesPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const categories = await getAdminCategories();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{t('categories')}</h1>
          <p className="text-sm text-muted numeric">{categories.length}</p>
        </div>
        <Button asChild>
          <Link href="/admin/categories/new">
            <Plus aria-hidden />
            {t('newCategory')}
          </Link>
        </Button>
      </div>

      {categories.length === 0 ? (
        <p className="rounded-[--radius-card] border border-border bg-surface p-8 text-center text-sm text-muted">
          {t('noCategories')}
        </p>
      ) : (
        <ul className="space-y-2">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                href={`/admin/categories/${category.id}`}
                // A logical property, so the indent is on the correct side in
                // Arabic without a second rule (§11).
                style={{ marginInlineStart: `${category.depth * 1.5}rem` }}
                className="flex flex-wrap items-center gap-3 rounded-[--radius-card] border border-border bg-surface p-4 transition-colors hover:border-border-strong"
              >
                <span className="font-medium text-ink">
                  {locale === 'ar' ? category.nameAr : category.nameEn}
                </span>
                <span className="text-xs text-subtle numeric">{category.slug}</span>
                {!category.isActive && <Badge variant="neutral">{t('inactive')}</Badge>}
                <span className="ms-auto text-sm text-muted numeric">
                  {t('productCount', { count: category.productCount })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
