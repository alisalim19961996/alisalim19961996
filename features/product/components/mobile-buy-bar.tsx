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
   * The variant the shopper has SELECTED, handed down by `ProductPurchase`.
   *
   * It used to be `product.variants[0]`, which the page called "cheapest"
   * though that query orders by `sortOrder` — so the bar added a different
   * thing from the one on screen, at a different price.
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
      {/*
        A named region, not a bare div: it is a landmark that appears without
        the page changing, so a screen reader user who tabs into it has nothing
        to say where they are. The name is also the only stable handle the e2e
        spec has — the button's label flips to "added", so filtering on it finds
        nothing the moment the bar has done its job.
      */}
      <section
        aria-label={t('buyBarLabel')}
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:hidden',
          'transition-transform duration-200',
          visible ? 'translate-y-0' : 'translate-y-full',
        )}
        /*
          Hidden from assistive tech while off-screen: the real controls above
          are the ones a screen reader user is already on.

          `inert` as well as `aria-hidden`, because the bar is translated out of
          the viewport rather than unmounted — so its button stayed in the tab
          order, and a keyboard user tabbing through the page landed on a
          control they could not see. `aria-hidden` on a focusable element is a
          contradiction browsers resolve by ignoring it.
        */
        aria-hidden={!visible}
        inert={!visible}
      >
        {/* `env(safe-area-inset-bottom)` so the bar clears the home indicator
            on a notched phone rather than sitting under it. */}
        <div className="container-page flex items-center gap-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
      </section>
    </>
  );
}
