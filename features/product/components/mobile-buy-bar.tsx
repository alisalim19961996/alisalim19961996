'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ProductPrice } from './product-price';
import { AddToCartButton } from '@/features/cart/components/add-to-cart-button';
import { cn } from '@/lib/utils';
import { MOBILE_BUY_BAR_OFFSET } from '@/config/ui';

/**
 * Sticky buy bar for phones.
 *
 * Research on mobile commerce is consistent that most people browse one-handed
 * and act with their thumb, and a product page is long — specifications, pros
 * and cons, related products. Without this, deciding to buy halfway down means
 * scrolling back up to find the button.
 *
 * It appears only after the shopper has scrolled past the real buy controls, so
 * it never covers the thing it duplicates, and only on small screens where the
 * controls are actually off-screen.
 */
export function MobileBuyBar({
  variantId,
  priceIqd,
  comparePriceIqd,
  name,
  purchasable,
}: {
  /**
   * The cheapest variant, matching the price shown beside it. The bar is a
   * shortcut for the simple case; a shopper who wants a different storage or
   * colour scrolls back to the picker, which is what the bar links them past.
   */
  variantId: string;
  priceIqd: number;
  comparePriceIqd: number | null;
  name: string;
  purchasable: boolean;
}) {
  const t = useTranslations('product');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 520px is past the gallery and the picker on a phone. Using a scroll
    // threshold rather than an observer on the button keeps this component
    // independent of the page's markup.
    const onScroll = () => setVisible(window.scrollY > MOBILE_BUY_BAR_OFFSET);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:hidden',
          'transition-transform duration-200',
          visible ? 'translate-y-0' : 'translate-y-full',
        )}
        // Hidden from assistive tech while off-screen: the real controls above
        // are the ones a screen reader user is already on.
        aria-hidden={!visible}
      >
        <div className="container-page flex items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted">{name}</p>
            <ProductPrice
              priceIqd={priceIqd}
              comparePriceIqd={comparePriceIqd}
              size="sm"
            />
          </div>

          <AddToCartButton
            variantId={variantId}
            disabled={!purchasable}
            label={t('addToCart')}
            size="md"
            block={false}
            className="shrink-0"
          />
        </div>
      </div>
    </>
  );
}
