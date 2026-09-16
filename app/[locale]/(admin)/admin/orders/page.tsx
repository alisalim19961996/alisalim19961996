import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Search } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { OrderStatusBadge } from '@/features/order/components/order-status-badge';
import { ProductPrice } from '@/features/product/components/product-price';
import { getAdminOrders } from '@/server/queries/admin';
import { orderFilterSchema } from '@/schemas/admin';
import { ORDER_PROGRESS } from '@/lib/domain/order-state';
import { formatIraqiPhone } from '@/lib/phone';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('orders'), robots: { index: false, follow: false } };
}

/**
 * The order queue.
 *
 * Filter state lives in the URL like the catalogue's does, so a staff member
 * can keep "everything still pending" open in a tab, reload it all day, and
 * share it with a colleague. The params come from the address bar, so they are
 * parsed and clamped rather than trusted.
 */
export default async function AdminOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, rawParams] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const [t, tOrder, tGov] = await Promise.all([
    getTranslations('admin'),
    getTranslations('order'),
    getTranslations('governorate'),
  ]);

  const filters = orderFilterSchema.parse(rawParams);
  const { rows, total, page, pageCount, counts } = await getAdminOrders(filters);

  const dateFormat = new Intl.DateTimeFormat(
    locale === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB',
    { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad' },
  );

  const tabs = [
    { status: undefined, label: t('allOrders'), count: counts.ALL ?? 0 },
    ...ORDER_PROGRESS.map((status) => ({
      status,
      label: tOrder(`status${status}`),
      count: counts[status] ?? 0,
    })),
  ];

  const hrefFor = (status?: string) =>
    `/admin/orders${status ? `?status=${status}` : ''}` as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">{t('orders')}</h1>
        <p className="text-sm text-muted numeric">{total}</p>
      </div>

      {/* -- Status tabs ------------------------------------------------- */}
      <nav aria-label={t('filterByStatus')} className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-1">
          {tabs.map((tab) => {
            const active = filters.status === tab.status;
            return (
              <li key={tab.label} className="shrink-0">
                <Link
                  href={hrefFor(tab.status)}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'inline-flex items-center gap-1.5 rounded-control bg-ink px-3 py-1.5 text-sm font-medium text-white'
                      : 'inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-ink'
                  }
                >
                  {tab.label}
                  <span className="text-xs numeric opacity-70">{tab.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* -- Search ------------------------------------------------------ */}
      {/*
        A GET form: the query belongs in the URL so the result is shareable and
        survives a reload. Nothing sensitive goes in it — staff search by order
        number, and a phone typed here is their own customer's, on their own
        authenticated screen.
      */}
      <form action="/admin/orders" className="flex gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={filters.q ?? ''}
          placeholder={t('searchOrders')}
          aria-label={t('searchOrders')}
          className="max-w-sm"
        />
        <Button type="submit" variant="outline">
          <Search aria-hidden />
          <span className="sr-only sm:not-sr-only">{t('search')}</span>
        </Button>
      </form>

      {/* -- Rows -------------------------------------------------------- */}
      {rows.length === 0 ? (
        <p className="rounded-card border border-border bg-surface px-5 py-12 text-center text-sm text-muted">
          {t('noOrders')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="border-b border-border text-start">
              <tr className="text-xs text-muted">
                <Th>{tOrder('orderNumber')}</Th>
                <Th>{t('customer')}</Th>
                <Th>{t('destination')}</Th>
                <Th>{tOrder('placedAt')}</Th>
                <Th>{t('status')}</Th>
                <Th align="end">{t('total')}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.orderNumber} className="hover:bg-canvas">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${row.orderNumber}`}
                      className="font-semibold text-ink numeric hover:text-primary"
                    >
                      {row.orderNumber}
                    </Link>
                    <p className="text-xs text-subtle numeric">{row.itemCount}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink">{row.fullName}</p>
                    <p className="text-xs text-muted numeric">
                      {formatIraqiPhone(row.phone)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted">{tGov(row.governorate)}</td>
                  <td className="px-4 py-3 text-muted numeric">
                    {dateFormat.format(row.placedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge
                      status={row.status}
                      label={tOrder(`status${row.status}`)}
                    />
                  </td>
                  <td className="px-4 py-3 text-end">
                    <ProductPrice
                      priceIqd={row.totalIqd}
                      comparePriceIqd={null}
                      size="sm"
                      className="justify-end"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label={t('pages')}>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
            <Link
              key={number}
              href={
                `/admin/orders?${new URLSearchParams({
                  ...(filters.status ? { status: filters.status } : {}),
                  ...(filters.q ? { q: filters.q } : {}),
                  page: String(number),
                }).toString()}` as const
              }
              aria-current={number === page ? 'page' : undefined}
              className={
                number === page
                  ? 'grid size-9 place-items-center rounded-control bg-ink text-sm font-medium text-white numeric'
                  : 'grid size-9 place-items-center rounded-control border border-border text-sm text-ink numeric hover:bg-surface'
              }
            >
              {number}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

function Th({
  children,
  align = 'start',
}: {
  children: React.ReactNode;
  align?: 'start' | 'end';
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 font-medium ${align === 'end' ? 'text-end' : 'text-start'}`}
    >
      {children}
    </th>
  );
}
