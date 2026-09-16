import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAdminBlogPosts } from '@/server/queries/admin-blog';
import { BlogPublishToggle } from '@/features/admin/components/blog-row-actions';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('guides'), robots: { index: false, follow: false } };
}

/**
 * The buying guides.
 *
 * Draft and published in one list with a tab between them, like the products
 * screen: an article being written and an article on the shop floor are the
 * same object at different moments, and hiding the drafts is how they get
 * forgotten.
 */
export default async function AdminBlogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, rawParams] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const status = rawParams['status'];
  const list = await getAdminBlogPosts({
    status: status === 'published' || status === 'draft' ? status : undefined,
    q: typeof rawParams['q'] === 'string' ? rawParams['q'] : undefined,
    page: Number(rawParams['page']) || 1,
  });

  const dateFormat = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-IQ' : 'en-GB', {
    dateStyle: 'medium',
  });

  const tabs = [
    { label: t('allProducts'), href: '/admin/blog' as const, active: !status },
    {
      label: t('published'),
      href: '/admin/blog?status=published' as const,
      active: status === 'published',
    },
    {
      label: t('draft'),
      href: '/admin/blog?status=draft' as const,
      active: status === 'draft',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{t('guides')}</h1>
          <p className="text-sm text-muted numeric">{list.total}</p>
        </div>
        <Button asChild>
          <Link href="/admin/blog/new">
            <Plus aria-hidden />
            {t('newGuide')}
          </Link>
        </Button>
      </div>

      <p className="max-w-prose text-sm text-muted">{t('guidesHint')}</p>

      <ul className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <li key={tab.label}>
            <Link
              href={tab.href}
              className={
                tab.active
                  ? 'inline-flex rounded-control bg-ink px-3 py-1.5 text-xs font-medium text-white'
                  : 'inline-flex rounded-control border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-border-strong'
              }
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>

      {list.rows.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted">
          {t('noGuides')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[40rem] text-start text-sm">
            <thead className="border-b border-border">
              <tr className="text-xs text-muted">
                <th className="px-4 py-3 text-start font-medium">
                  {t('guideTitleAr')}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('guidePublishedAt')}
                </th>
                <th className="px-4 py-3 text-end font-medium">{t('status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.rows.map((row) => (
                <tr key={row.id} className="hover:bg-canvas">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/blog/${row.id}`}
                      className="font-medium text-ink hover:text-primary"
                    >
                      {locale === 'ar' ? row.titleAr : row.titleEn}
                    </Link>
                    <p className="truncate text-xs text-subtle numeric">{row.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-muted numeric">
                    {row.publishedAt ? dateFormat.format(row.publishedAt) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Badge variant={row.isPublished ? 'success' : 'neutral'}>
                        {row.isPublished ? t('published') : t('draft')}
                      </Badge>
                      <BlogPublishToggle id={row.id} isPublished={row.isPublished} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
