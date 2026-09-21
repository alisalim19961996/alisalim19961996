'use client';

import { useEffect, useRef } from 'react';
import { storeEvent, type StoreEventItem } from '@/lib/domain/analytics';
import { trackPurchaseOnce } from './track';

/**
 * Report one sale, once.
 *
 * Rendered only when the confirmation page is being seen for the first time —
 * the page already distinguishes that from a customer returning to look at an
 * order, because it changes the greeting for exactly the same reason.
 *
 * Belt and braces on the counting, deliberately: the page's own `?placed=1`
 * check is the first guard, and `trackPurchaseOnce` keys on the order number
 * in `sessionStorage` as the second. A reload with the query still in the
 * address bar is the ordinary case, not a clever one, and reporting a second
 * sale for it would put a number in the owner's reports that no money matches.
 *
 * Renders nothing. It exists as a component because the page is a Server
 * Component and this has to happen in the browser.
 */
export function PurchaseReport({
  orderNumber,
  totalIqd,
  items,
}: {
  orderNumber: string;
  totalIqd: number;
  items: StoreEventItem[];
}) {
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    trackPurchaseOnce(
      orderNumber,
      storeEvent('purchase', items, {
        valueIqd: totalIqd,
        transactionId: orderNumber,
      }),
    );
  }, [orderNumber, totalIqd, items]);

  return null;
}
