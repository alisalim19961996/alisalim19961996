import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { OrderActions } from '@/features/admin/components/order-actions';
import { OrderStatusBadge } from '@/features/order/components/order-status-badge';
import { ProductPrice } from '@/features/product/components/product-price';
import { getAdminOrder } from '@/server/queries/admin';
import { normalizeOrderNumber } from '@/lib/domain/order-number';
import { formatIraqiPhone, toWhatsappNumber } from '@/lib/phone';
import type { Locale } from '@/i18n/routing';
import { dateTimeFormatter } from '@/lib/datetime';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; orderNumber: string }>;
}): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: orderNumber, robots: { index: false, follow: false } };
}

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ locale: Locale; orderNumber: string }>;
}) {
  const { locale, orderNumber: raw } = await params;
  setRequestLocale(locale);

  const [t, tOrder, tGov, tCart] = await Promise.all([
    getTranslations('admin'),
    getTranslations('order'),
    getTranslations('governorate'),
    getTranslations('cart'),
  ]);

  const orderNumber = normalizeOrderNumber(decodeURIComponent(raw));
  const order = orderNumber ? await getAdminOrder(orderNumber, locale) : null;
  if (!order) notFound();

  const dateTime = dateTimeFormatter(locale, 'medium');

  // Iraqi commerce runs on WhatsApp; a staff member confirming an order wants
  // one tap, not a copy-paste. Null for a number that is not Iraqi mobile.
  const whatsapp = toWhatsappNumber(order.phone);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
        >
          <ArrowRight className="size-4 flip-rtl" aria-hidden />
          {t('orders')}
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-ink numeric">{order.orderNumber}</h1>
          <OrderStatusBadge
            status={order.status}
            label={tOrder(`status${order.status}`)}
          />
          <span className="text-sm text-muted numeric">
            {dateTime.format(order.placedAt)}
          </span>
        </div>
      </div>

      {/* -- What to do next --------------------------------------------- */}
      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">{t('changeStatus')}</h2>
        <div className="mt-4">
          <OrderActions
            orderNumber={order.orderNumber}
            nextStatuses={order.nextStatuses}
          />
        </div>
        {order.cancelReason && (
          <p className="mt-4 border-t border-border pt-4 text-sm text-danger">
            {order.cancelReason}
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="space-y-6">
          {/* -- Items ------------------------------------------------- */}
          <section className="rounded-card border border-border bg-surface">
            <h2 className="border-b border-border px-5 py-3 text-sm font-semibold text-ink">
              {tOrder('items')}
            </h2>
            <ul className="divide-y divide-border">
              {order.lines.map((line) => (
                <li key={line.sku} className="flex gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{line.name}</p>
                    <p className="mt-0.5 text-xs text-muted numeric">
                      {line.sku} · {line.variantLabel}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm text-muted numeric">
                    ×{line.quantity}
                  </p>
                  <ProductPrice
                    priceIqd={line.lineTotalIqd}
                    comparePriceIqd={null}
                    size="sm"
                    className="shrink-0"
                  />
                </li>
              ))}
            </ul>
          </section>

          {/* -- Timeline ---------------------------------------------- */}
          <section className="rounded-card border border-border bg-surface">
            <h2 className="border-b border-border px-5 py-3 text-sm font-semibold text-ink">
              {tOrder('timeline')}
            </h2>
            <ol className="divide-y divide-border">
              {order.timeline.map((entry, index) => (
                <li key={index} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-ink">
                      {tOrder(`status${entry.toStatus}`)}
                    </span>
                    <span className="text-xs text-subtle numeric">
                      {dateTime.format(entry.at)}
                    </span>
                    {/* Who did it: an order that changed by itself is a bug. */}
                    {entry.actorName && (
                      <span className="text-xs text-muted">{entry.actorName}</span>
                    )}
                  </div>
                  {entry.note && (
                    <p className="mt-1 text-xs text-muted">{entry.note}</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* -- Customer and money ------------------------------------- */}
        <aside className="space-y-6">
          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">{t('customer')}</h2>
            <div className="mt-3 space-y-1 text-sm">
              <p className="font-medium text-ink">{order.fullName}</p>
              <p className="numeric">
                <a href={`tel:${order.phone}`} className="text-primary hover:underline">
                  {formatIraqiPhone(order.phone)}
                </a>
              </p>
              {whatsapp && (
                <p>
                  <a
                    href={`https://wa.me/${whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-success hover:underline"
                  >
                    {t('openWhatsapp')}
                  </a>
                </p>
              )}
              <p className="pt-2 text-ink-soft">
                {tGov(order.governorate)} — {order.city}
              </p>
              <p className="text-muted">{order.addressLine}</p>
              {order.notes && (
                <p className="mt-2 rounded-control bg-canvas px-3 py-2 text-xs text-ink-soft">
                  {order.notes}
                </p>
              )}
            </div>
          </section>

          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">{t('total')}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label={tOrder('items')}>
                <ProductPrice
                  priceIqd={order.subtotalIqd}
                  comparePriceIqd={null}
                  size="sm"
                />
              </Row>
              <Row label={tCart('delivery')}>
                <ProductPrice
                  priceIqd={order.deliveryIqd}
                  comparePriceIqd={null}
                  size="sm"
                />
              </Row>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <dt className="font-semibold text-ink">{t('total')}</dt>
                <dd>
                  <ProductPrice
                    priceIqd={order.totalIqd}
                    comparePriceIqd={null}
                    size="sm"
                  />
                </dd>
              </div>
              {order.paymentStatus && (
                <Row label={tOrder('paymentMethod')}>
                  <span className="text-ink">{t(`payment${order.paymentStatus}`)}</span>
                </Row>
              )}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
