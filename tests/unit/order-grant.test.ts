import { describe, expect, it } from 'vitest';
import {
  createOrderGrant,
  hashOrderGrant,
  isOrderGrantShape,
} from '@/lib/domain/order-grant';

/**
 * The grant replaces a check that was `cookieValue === orderNumber`, on
 * sequential numbers, with `httpOnly` mistaken for "the client cannot set
 * this". These tests hold the two properties that make the replacement worth
 * having: the value cannot be produced, and what is stored is not the value.
 */
describe('order grant', () => {
  it('is 256 bits of base64url', () => {
    const grant = createOrderGrant();
    expect(grant).toHaveLength(43);
    expect(grant).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('never repeats', () => {
    const seen = new Set(Array.from({ length: 500 }, () => createOrderGrant()));
    expect(seen.size).toBe(500);
  });

  it('hashes to something that is not the grant', () => {
    const grant = createOrderGrant();
    const hash = hashOrderGrant(grant);
    expect(hash).not.toBe(grant);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes the same value the same way, and different values differently', () => {
    const a = createOrderGrant();
    const b = createOrderGrant();
    expect(hashOrderGrant(a)).toBe(hashOrderGrant(a));
    expect(hashOrderGrant(a)).not.toBe(hashOrderGrant(b));
  });

  it('refuses an order number, which is what the old cookie carried', () => {
    // The whole point: a browser still holding `mps.recent_order` presents a
    // value that is not a grant, and gets nothing.
    expect(isOrderGrantShape('MPS-26091-0042')).toBe(false);
    expect(isOrderGrantShape('MPS-26091-0043')).toBe(false);
  });

  it('refuses an empty, absent or wrong-length value', () => {
    expect(isOrderGrantShape(null)).toBe(false);
    expect(isOrderGrantShape(undefined)).toBe(false);
    expect(isOrderGrantShape('')).toBe(false);
    expect(isOrderGrantShape('a'.repeat(42))).toBe(false);
    expect(isOrderGrantShape('a'.repeat(44))).toBe(false);
    // A cart token namespace, in case the two cookies are ever confused.
    expect(isOrderGrantShape(`user:${'a'.repeat(37)}`)).toBe(false);
  });

  it('accepts what it produces', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isOrderGrantShape(createOrderGrant())).toBe(true);
    }
  });
});
