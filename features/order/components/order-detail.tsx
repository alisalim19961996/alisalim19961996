import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  isFailedOutcome,
  ORDER_PROGRESS,
  progressIndex,
} from '@/lib/domain/order-state';
import { formatIraqiPhone } from '@/lib/phone';
import { ProductPrice } from '@/features/product/components/product-price';
import type { OrderView } from '@/server/queries/order';
import type { Locale } from '@/i18n/routing';

/**
 * One order, rendered the same way on the confirmation page and on public
 * tracking — a customer who tracks an order should see exactly what they saw
 * when they placed it, not a thinner "tracking" version of the truth.
 *
 * A server component: there is nothing interactive here, so none of it needs
 * to reach the browser as JavaScript.
 */

export async function OrderDetail({
  order,
  locale,
}: {
  order: OrderView;
  locale: Locale;
}) {
  const [t, tCart, tGov, tCheckout] = await Promise.all([
    getTranslations('order'),
    getTranslations('cart'),
    getTranslations('governorate'),
    getTranslations('checkout'),
  ]);

  const isTerminalFailure = isFailedOutcome(order.status);
  const reachedIndex = progressIndex(order.status);

  const placedAt = new Intl.DateTimeFormat(
    locale === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB',
    { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baghdad' },
  ).format(order.placedAt);

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="space-y-8">
        {/* -- Progress -------------------------------------------------- */}
        <section>
          <h2 className="text-base font-bold text-ink">{t('timeline')}</h2>

          {isTerminalFailure ? (
            <p className="mt-3 rounded-[--radius-card] border border-danger-soft bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
              {t(`status${order.status}`)}
            </p>
          ) : (
            <ol className="mt-4 space-y-0">
              {ORDER_PROGRESS.map((status, index) => {
                const done = index <= reachedIndex;
                const current = index === reachedIndex;
                return (
                  <li key={status} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          'grid size-6 shrink-0 place-items-center rounded-full border',
                          done
                            ? 'border-success bg-success text-white'
                            : 'border-border bg-surface text-subtle',
                        )}
                      >
                        {done ? (
                          <Check className="size-3.5" strokeWidth={3} aria-hidden />
                        ) : (
                          <Circle className="size-2 fill-current" aria-hidden />
                        )}
                      </span>
                      {index < ORDER_PROGRESS.length - 1 && (
                        <span
                          className={cn(
                            'w-px flex-1',
                            done ? 'bg-success' : 'bg-border',
                          )}
                        />
                      )}
                    </div>
                    <span
                      className={cn(
                        'pb-6 text-sm',
                        current
                          ? 'font-semibold text-ink'
                          : done
                            ? 'text-ink-soft'
                            : 'text-subtle',
                      )}
                    >
                      {t(`status${status}`)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* -- Items ----------------------------------------------------- */}
        <section>
          <h2 className="text-base font-bold text-ink">{t('items')}</h2>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {order.lines.map((line) => (
              <li key={line.sku} className="flex gap-4 py-4">
                <div className="relative aspect-product w-16 shrink-0 overflow-hidden rounded-[--radius-card] bg-canvas">
                  {line.imageUrl && (
                    <Image
                      src={line.imageUrl}
                      alt={line.name}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">{line.brandName}</p>
                  <p className="truncate text-sm font-semibold text-ink">{line.name}</p>
                  <p className="mt-0.5 text-xs text-muted numeric">
                    {line.variantLabel} · {line.quantity}
                  </p>
                </div>
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

        {/* -- Address --------------------------------------------------- */}
        <section>
          <h2 className="text-base font-bold text-ink">{t('deliveryAddress')}</h2>
          <div className="mt-3 space-y-1 text-sm text-ink-soft">
            <p className="font-medium text-ink">{order.fullName}</p>
            <p className="numeric">{formatIraqiPhone(order.phone)}</p>
            <p>
              {tGov(order.governorate)} — {order.city}
            </p>
            <p className="text-muted">{order.addressLine}</p>
            {order.notes && <p className="text-muted">{order.notes}</p>}
          </div>
        </section>
      </div>

      {/* -- Summary ----------------------------------------------------- */}
      <aside className="rounded-[--radius-panel] border border-border bg-surface p-5">
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{t('orderNumber')}</dt>
            <dd className="font-semibold text-ink numeric">{order.orderNumber}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{t('placedAt')}</dt>
            <dd className="text-ink numeric">{placedAt}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{t('paymentMethod')}</dt>
            <dd className="text-ink">{tCheckout('cashOnDelivery')}</dd>
          </div>
        </dl>

        <dl className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted">{tCart('subtotal')}</dt>
            <dd>
              <ProductPrice
                priceIqd={order.subtotalIqd}
                comparePriceIqd={null}
                size="sm"
              />
            </dd>
          </div>
          {order.discountIqd > 0 && (
            <div className="flex items-center justify-between">
              <dt className="text-muted">{t('discount')}</dt>
              {/*
                Through ProductPrice like every other figure, so it is grouped,
                carries the currency and is isolated from bidi reordering. The
                minus sits outside, where it cannot be dragged into the digits.
              */}
              <dd className="flex items-center gap-0.5 text-success">
                <span aria-hidden>-</span>
                <ProductPrice
                  priceIqd={order.discountIqd}
                  comparePriceIqd={null}
                  size="sm"
                />
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between">
            <dt className="text-muted">{tCart('delivery')}</dt>
            <dd>
              {order.deliveryIqd === 0 ? (
                <span className="font-medium text-success">{tCart('free')}</span>
              ) : (
                <ProductPrice
                  priceIqd={order.deliveryIqd}
                  comparePriceIqd={null}
                  size="sm"
                />
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="text-sm font-semibold text-ink">{tCart('total')}</span>
          <ProductPrice priceIqd={order.totalIqd} comparePriceIqd={null} size="md" />
        </div>
      </aside>
    </div>
  );
}
