import { describe, expect, it } from 'vitest';
import {
  checkoutIdempotencyKey,
  isCheckoutRequestId,
} from '@/lib/domain/checkout-request';

/**
 * The key that makes one confirmation attempt happen once.
 *
 * The property worth testing is not that it hashes — it is that the CART is
 * part of what it hashes. A bare client-chosen id would be an unguessable
 * string, and guessing somebody else's would replay their order number back to
 * whoever asked.
 */
describe('checkout idempotency key', () => {
  const A = '0b6b8a3e-6f2f-4a5c-9f3a-1d2e3f4a5b6c';
  const B = 'ffffffff-6f2f-4a5c-9f3a-1d2e3f4a5b6c';

  it('is stable for one cart and one request', () => {
    expect(checkoutIdempotencyKey('cart_1', A)).toBe(
      checkoutIdempotencyKey('cart_1', A),
    );
  });

  it('differs for the same request id in a different cart', () => {
    // This is the whole security property: the same guessed id cannot reach
    // another cart's order.
    expect(checkoutIdempotencyKey('cart_1', A)).not.toBe(
      checkoutIdempotencyKey('cart_2', A),
    );
  });

  it('differs for a different request in the same cart', () => {
    expect(checkoutIdempotencyKey('cart_1', A)).not.toBe(
      checkoutIdempotencyKey('cart_1', B),
    );
  });

  it('is not the request id, and does not contain it', () => {
    const key = checkoutIdempotencyKey('cart_1', A);
    expect(key).not.toBe(A);
    expect(key).not.toContain(A);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is null for anything that is not a UUID', () => {
    // Null means "no replay protection for this attempt", which the cart row
    // lock still covers — so an old page still checks out rather than failing.
    expect(checkoutIdempotencyKey('cart_1', null)).toBeNull();
    expect(checkoutIdempotencyKey('cart_1', undefined)).toBeNull();
    expect(checkoutIdempotencyKey('cart_1', '')).toBeNull();
    expect(checkoutIdempotencyKey('cart_1', 'not-a-uuid')).toBeNull();
    expect(checkoutIdempotencyKey('cart_1', 42)).toBeNull();
    expect(checkoutIdempotencyKey('cart_1', { toString: () => A })).toBeNull();
  });

  it('accepts a real randomUUID, in either case', () => {
    const id = crypto.randomUUID();
    expect(isCheckoutRequestId(id)).toBe(true);
    expect(isCheckoutRequestId(id.toUpperCase())).toBe(true);
  });
});
