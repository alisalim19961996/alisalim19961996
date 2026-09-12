'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from '@/i18n/navigation';
import { getCartCountAction } from '../actions';
import { CART_CHANGED_EVENT } from '../cart-events';

/**
 * The number on the header's cart icon.
 *
 * Client-side on purpose — see getCartCountAction. It refreshes on three
 * signals:
 *
 *  - the cart-changed event, so adding from a product page updates it without
 *    a navigation;
 *  - every navigation, because the header lives in the layout and therefore
 *    does NOT remount as the customer moves around. Without this the badge
 *    still read "2" on the confirmation page of an order that had just emptied
 *    the cart;
 *  - returning to the tab, because the same cart may have been changed in
 *    another tab or on a phone.
 *
 * It renders nothing until it knows the count, rather than flashing a zero
 * that then becomes a three.
 */
export function CartCountBadge() {
  const [count, setCount] = useState<number | null>(null);
  const pathname = usePathname();

  const refresh = useCallback(() => {
    getCartCountAction()
      .then(setCount)
      // A failed count is not worth an error to the customer: the icon still
      // links to the cart, and the page they land on reads the real thing.
      .catch(() => setCount(null));
  }, []);

  useEffect(() => {
    refresh();

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener(CART_CHANGED_EVENT, refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(CART_CHANGED_EVENT, refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // pathname is a dependency so the count is re-read on every navigation,
    // not only when this component first mounts.
  }, [refresh, pathname]);

  if (!count) return null;

  return (
    <span
      // Latin digits, LTR-isolated: the count sits on top of an icon, where
      // bidi reordering would be very visible.
      className="absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.6875rem] font-bold text-white numeric"
    >
      {count}
    </span>
  );
}
