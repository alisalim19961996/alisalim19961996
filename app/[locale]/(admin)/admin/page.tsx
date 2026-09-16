import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AlertTriangle, Package, PackageCheck, Star, Truck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { getAdminOverview } from '@/server/queries/admin';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('dashboard'), robots: { index: false, follow: false } };
}

/**
 * The landing screen.
 *
 * Every tile is a count of work waiting, and every tile is a link to that
 * work. A dashboard that reports numbers you cannot act on is decoration.
 */
export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const overview = await getAdminOverview();

  const tiles = [
    {
      key: 'pending',
      value: overview.pending,
      href: '/admin/orders?status=PENDING',
      icon: Package,
      tone: overview.pending > 0 ? 'urgent' : 'calm',
    },
    {
      key: 'processing',
      value: overview.processing,
      href: '/admin/orders?status=CONFIRMED',
      icon: PackageCheck,
      tone: 'calm',
    },
    {
      key: 'outForDelivery',
      value: overview.outForDelivery,
      href: '/admin/orders?status=OUT_FOR_DELIVERY',
      icon: Truck,
      tone: 'calm',
    },
    {
      key: 'deliveredToday',
      value: overview.deliveredToday,
      href: '/admin/orders?status=DELIVERED',
      icon: PackageCheck,
      tone: 'good',
    },
    {
      // Urgent while anything is waiting, for the same reason PENDING orders
      // are: somebody wrote it and is waiting to see it appear.
      key: 'reviewsPending',
      value: overview.pendingReviews,
      href: '/admin/reviews',
      icon: Star,
      tone: overview.pendingReviews > 0 ? 'urgent' : 'calm',
    },
  ] as const;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-ink">{t('dashboard')}</h1>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <li key={tile.key}>
              <Link
                href={tile.href}
                className="block rounded-card border border-border bg-surface p-5 transition-colors hover:border-border-strong"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">{t(tile.key)}</span>
                  <Icon
                    className={
                      tile.tone === 'urgent'
                        ? 'size-4 text-primary'
                        : tile.tone === 'good'
                          ? 'size-4 text-success'
                          : 'size-4 text-subtle'
                    }
                    aria-hidden
                  />
                </div>
                <p className="mt-2 text-2xl font-bold text-ink numeric">{tile.value}</p>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-5">
          <p className="text-sm text-muted">{t('publishedProducts')}</p>
          <p className="mt-2 text-2xl font-bold text-ink numeric">
            {overview.products}
          </p>
        </div>

        {/*
          Only variants with trackQuantity can be low: the rest sell on status,
          so a zero here means "nothing counted is running out", not "nothing
          is running out".
        */}
        <div className="rounded-card border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">{t('lowStock')}</p>
            {overview.lowStock > 0 && (
              <AlertTriangle className="size-4 text-warning" aria-hidden />
            )}
          </div>
          <p className="mt-2 text-2xl font-bold text-ink numeric">
            {overview.lowStock}
          </p>
          <p className="mt-1 text-xs text-subtle">{t('lowStockNote')}</p>
        </div>
      </div>
    </div>
  );
}
