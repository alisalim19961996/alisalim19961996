'use client';

import type { StoreEvent } from '@/lib/domain/analytics';

/**
 * Push an event to whatever the owner has connected, or to nothing.
 *
 * `window.dataLayer` is the queue every tag manager reads and the one thing
 * that is vendor-neutral: an array. If nothing created it, this creates it and
 * it is simply an array nobody reads — no request, no cookie, no identifier.
 *
 * Wrapped in try/catch on purpose. Analytics must never be able to break a
 * purchase: a tag that replaces `dataLayer` with something that throws on
 * `push` would otherwise take the checkout button down with it.
 */
export function track(event: StoreEvent): void {
  if (typeof window === 'undefined') return;

  try {
    const target = window as typeof window & { dataLayer?: unknown[] };
    target.dataLayer = target.dataLayer ?? [];
    target.dataLayer.push(event);
  } catch {
    // Deliberately silent: a broken tag is the owner's to fix, and a console
    // error on every add-to-cart teaches staff to ignore the console.
  }
}

/**
 * Count a purchase once per order, per browser.
 *
 * The confirmation page is a real URL the customer can reload, bookmark and
 * come back to — reloading it must not report a second sale. `sessionStorage`
 * is the right store for exactly this: it is per-tab, it is not sent anywhere,
 * and the worst case of losing it is one duplicate in a report rather than
 * anything the customer sees.
 */
export function trackPurchaseOnce(orderNumber: string, event: StoreEvent): void {
  if (typeof window === 'undefined') return;

  const key = `mps.purchase.${orderNumber}`;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
  } catch {
    // Private browsing, or storage the browser refuses. Counting once is the
    // goal; counting twice beats not counting a real sale at all.
  }

  track(event);
}
