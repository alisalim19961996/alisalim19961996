import { useLocale } from 'next-intl';
import { discountPercentage, formatIqd } from '@/lib/money';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The one place a price is rendered.
 *
 * Prices are wrapped in `.numeric`, which pins them to LTR: Arabic text around
 * a number otherwise lets bidi reordering move the digits, and "1,250,000" can
 * come out reordered next to a currency word. This is the detail that makes
 * most Arabic stores look broken, and it is fixed once, here.
 */
export function ProductPrice({
  priceIqd,
  comparePriceIqd,
  size = 'md',
  className,
}: {
  priceIqd: number;
  comparePriceIqd?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const locale = useLocale() as Locale;
  const discount = discountPercentage(priceIqd, comparePriceIqd);
  const hasDiscount = discount > 0;

  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-1', className)}>
      <span
        className={cn(
          'font-bold text-ink numeric',
          size === 'sm' && 'text-sm',
          size === 'md' && 'text-base',
          size === 'lg' && 'text-2xl sm:text-3xl',
        )}
      >
        {formatIqd(priceIqd, locale)}
      </span>

      {hasDiscount && comparePriceIqd != null && (
        <>
          <span
            className={cn(
              'text-subtle numeric line-through',
              size === 'lg' ? 'text-base' : 'text-xs',
            )}
          >
            {formatIqd(comparePriceIqd, locale, { withSymbol: false })}
          </span>
          <span
            className={cn(
              'rounded-full bg-primary-soft px-1.5 py-0.5 font-semibold text-primary numeric',
              size === 'lg' ? 'text-xs' : 'text-[11px]',
            )}
          >
            −{discount}%
          </span>
        </>
      )}
    </div>
  );
}
