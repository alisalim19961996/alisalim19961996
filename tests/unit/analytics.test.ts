import { describe, expect, it } from 'vitest';
import { storeEvent } from '@/lib/domain/analytics';

/**
 * Analytics is invisible by nature: nothing on screen changes when the numbers
 * are wrong, so the arithmetic is the part that has to be checked somewhere.
 *
 * What is NOT here is as deliberate as what is. No name, no phone, no address
 * ever reaches an event — those belong to the order, behind a guard, and a
 * value in a browser-readable queue has left the building.
 */

const PHONE = { item_id: 'tecno-spark', item_name: 'Tecno Spark', price: 180_000 };

describe('a store event', () => {
  it('sums the lines when no total is given', () => {
    const event = storeEvent('add_to_cart', [{ ...PHONE, quantity: 2 }]);
    expect(event.value).toBe(360_000);
    expect(event.currency).toBe('IQD');
  });

  it('takes the server total when one is given, rather than re-deriving it', () => {
    // A purchase total is subtotal - discount + delivery. Summing the lines
    // would report the discount as revenue the store never took.
    const event = storeEvent('purchase', [{ ...PHONE, quantity: 1 }], {
      valueIqd: 175_000,
      transactionId: 'MPS-26091-0042',
    });
    expect(event.value).toBe(175_000);
    expect(event.transaction_id).toBe('MPS-26091-0042');
  });

  it('carries no transaction id unless it is a purchase', () => {
    expect(storeEvent('view_item', [{ ...PHONE, quantity: 1 }])).not.toHaveProperty(
      'transaction_id',
    );
  });

  it('is zero for an empty basket rather than NaN', () => {
    expect(storeEvent('begin_checkout', []).value).toBe(0);
  });

  it("copies the items instead of holding the caller's array", () => {
    const items = [{ ...PHONE, quantity: 1 }];
    const event = storeEvent('view_item', items);
    items.push({ ...PHONE, quantity: 9 });
    expect(event.items).toHaveLength(1);
  });
});
