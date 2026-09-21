/**
 * What the store would report, if the owner ever connects something to report
 * to.
 *
 * MPS ships no analytics provider. There is no script tag, no third-party
 * request and no identifier — adding one would be choosing a vendor and a
 * privacy posture on the owner's behalf, and this file's whole point is not to.
 *
 * What it does is name the four moments worth counting and give them one
 * shape. When the owner pastes a tag manager snippet into the layout, the
 * events are already being pushed and the funnel is already there. Until then
 * `window.dataLayer` does not exist and `track()` returns without doing
 * anything.
 *
 * **No personal data, ever.** An event carries product ids, quantities and
 * whole dinars. Not a name, not a phone number, not an address — those belong
 * to the order, which lives in Postgres behind a guard, and a value that
 * leaves the server in a browser-readable queue has left the building.
 */

/** The four events, named as GA4 names them so a tag needs no translation. */
export type StoreEventName =
  'view_item' | 'add_to_cart' | 'begin_checkout' | 'purchase';

export interface StoreEventItem {
  /** The product slug: stable, and already public in the URL. */
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
}

export interface StoreEvent {
  event: StoreEventName;
  currency: 'IQD';
  value: number;
  items: StoreEventItem[];
  /** Only on `purchase`, and only the order NUMBER — never the row id. */
  transaction_id?: string;
}

/**
 * The payload, built from whole dinars and nothing else.
 *
 * Pure so it can be unit-tested: an analytics bug is invisible by nature —
 * nothing on screen changes when the numbers are wrong — so the arithmetic is
 * the part that has to be checked somewhere.
 */
export function storeEvent(
  event: StoreEventName,
  items: readonly StoreEventItem[],
  options: { valueIqd?: number; transactionId?: string } = {},
): StoreEvent {
  const value =
    options.valueIqd ??
    items.reduce((total, item) => total + item.price * item.quantity, 0);

  return {
    event,
    currency: 'IQD',
    value,
    items: [...items],
    ...(options.transactionId ? { transaction_id: options.transactionId } : {}),
  };
}
