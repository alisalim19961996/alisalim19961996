import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, Package } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { OrderStatusBadge } from './order-status-badge';
import { formatIqd } from '@/lib/money';
import type { AccountOrderRow } from '@/server/queries/order';
import type { Locale } from '@/i18n/routing';

/**
 * A customer's orders, as rows.
 *
 * Each links to `/orders/<number>`, the page that already exists for the
 * confirmation screen — it checks ownership itself (`findOwnedOrder`), so
 * there is no second detail view to keep in step and no second place where
 * somebody else's address could leak.
 *
 * A server component: nothing here is interactive.
 */
export async function OrderHistory({
  rows,
  locale,
}: {
  rows: readonly AccountOrderRow[];
  locale: Locale;
}) {
  const t = await getTranslations('account');
  const tOrder = await getTranslations('order');

  const date = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB', {
    dateStyle: 'medium',
    timeZone: 'Asia/Baghdad',
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-[--radius-card] border border-border bg-surface p-8 text-center">
        <Package className="mx-auto size-8 text-subtle" aria-hidden />
        <p className="mt-3 text-sm text-muted">{t('noOrders')}</p>
        <Link
          href="/products"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          {t('startShopping')}
          <ArrowLeft className="size-4 flip-rtl" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.orderNumber}>
          <Link
            href={`/orders/${row.orderNumber}`}
            className="flex items-center gap-4 rounded-[--radius-card] border border-border bg-surface p-4 transition-colors hover:border-border-strong"
          >
            <span className="relative size-14 shrink-0 overflow-hidden rounded-[--radius-control] bg-canvas">
              {row.imageUrl ? (
                <Image
                  src={row.imageUrl}
                  alt=""
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              ) : (
                <span className="grid size-full place-items-center text-subtle">
                  <Package className="size-5" aria-hidden />
                </span>
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink numeric">
                {row.orderNumber}
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {date.format(row.placedAt)} · {t('itemCount', { count: row.itemCount })}
              </span>
            </span>

            <span className="flex shrink-0 flex-col items-end gap-1.5">
              <OrderStatusBadge
                status={row.status}
                label={tOrder(`status${row.status}`)}
              />
              <span className="text-sm font-semibold text-ink numeric">
                {formatIqd(row.totalIqd, locale)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
