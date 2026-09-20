'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Truck } from 'lucide-react';
import { ProductPrice } from './product-price';
import { quoteDeliveryForProductAction } from '../actions';

/**
 * What delivery costs, before the customer commits to anything.
 *
 * The box beside the buy controls used to hold the warranty and the product's
 * CATEGORY — which the breadcrumb already says, and which nobody has ever
 * decided a purchase on. Delivery is the figure they actually want, and until
 * now it appeared for the first time at checkout, after the address.
 *
 * It loads after hydration on purpose. The product page is prerendered (§8) and
 * the fee depends on a governorate this visitor has not chosen yet, so there is
 * nothing to render on the server — and reading a cookie to guess would turn
 * all 32 product pages into per-request renders.
 *
 * The figure comes from `quoteDeliveryFor`, the same function that prices the
 * order, against the SELECTED variant's price so a free-delivery threshold is
 * answered honestly rather than optimistically.
 */
export function DeliveryEstimate({
  governorates,
  subtotalIqd,
}: {
  governorates: readonly string[];
  /** The selected variant's price, so the threshold is judged on a real basket. */
  subtotalIqd: number;
}) {
  const t = useTranslations('product');
  const tCart = useTranslations('cart');
  const tGovernorate = useTranslations('governorate');

  const [governorate, setGovernorate] = useState('');
  const [quote, setQuote] = useState<{
    feeIqd: number;
    isFree: boolean;
    etaMinDays: number;
    etaMaxDays: number;
  } | null>(null);
  const [pending, startQuoting] = useTransition();

  const choose = (value: string) => {
    setGovernorate(value);
    // Cleared first: the previous governorate's fee beside a new name is a
    // number for an address the customer is no longer asking about.
    setQuote(null);
    if (!value) return;
    startQuoting(async () => {
      setQuote(await quoteDeliveryForProductAction(value, subtotalIqd));
    });
  };

  return (
    <div className="flex items-start gap-2.5">
      <Truck className="mt-0.5 size-4 shrink-0 flip-rtl text-ink-soft" aria-hidden />
      <div className="min-w-0 flex-1">
        <label htmlFor="pdp-governorate" className="text-xs text-subtle">
          {t('deliveryTo')}
        </label>
        <select
          id="pdp-governorate"
          value={governorate}
          onChange={(event) => choose(event.target.value)}
          className="mt-0.5 block w-full rounded-control border border-border-field bg-surface px-2 py-1.5 text-sm font-medium text-ink"
        >
          <option value="">{t('deliveryPickGovernorate')}</option>
          {governorates.map((value) => (
            <option key={value} value={value}>
              {tGovernorate(value)}
            </option>
          ))}
        </select>

        {pending && (
          <Loader2 className="mt-1.5 size-4 animate-spin text-subtle" aria-hidden />
        )}

        {!pending && quote && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            {quote.isFree ? (
              <span className="font-medium text-success">{tCart('free')}</span>
            ) : (
              <ProductPrice priceIqd={quote.feeIqd} comparePriceIqd={null} size="sm" />
            )}
            <span className="numeric">
              {t('deliveryEtaDays', {
                min: quote.etaMinDays,
                max: quote.etaMaxDays,
              })}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
