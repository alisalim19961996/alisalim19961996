import { createHash, randomBytes } from 'node:crypto';

/**
 * The secret that lets the browser which placed an order open it again.
 *
 * MPS used to do this with the order number itself, in an httpOnly cookie
 * called `mps.recent_order`. `httpOnly` stops JavaScript reading a cookie; it
 * does nothing about a client SETTING one. And order numbers are sequential by
 * design (§12) — they have to be readable aloud to a courier — so anyone could
 * type `mps.recent_order=MPS-26091-0042` into their own browser and read that
 * customer's name, phone number and address, then walk the day's four digits.
 *
 * So the cookie now carries a value the client cannot produce: 32 bytes of
 * CSPRNG entropy. Only its SHA-256 is stored, for the reason a password hash
 * exists — a leaked backup of the `order` table must not be a working key to
 * every guest order in it.
 *
 * Pure, and in `lib/domain/` rather than the service, so the two halves can be
 * unit-tested without a database: this is the one place that decides what
 * proves a guest owns an order.
 */

/** 32 bytes = 256 bits. The plan's floor, and the cart token's size. */
const GRANT_BYTES = 32;

/** base64url so it can sit in a cookie with no encoding of its own. */
export function createOrderGrant(): string {
  return randomBytes(GRANT_BYTES).toString('base64url');
}

/**
 * What gets stored. SHA-256 rather than a password hash on purpose: this is a
 * high-entropy random token, not a memorable secret, so there is nothing for a
 * work factor to defend against — an attacker who cannot guess 256 bits cannot
 * brute-force its hash either, and the lookup is on the hot path of a page.
 */
export function hashOrderGrant(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * A grant a cookie could plausibly be carrying.
 *
 * Refusing the obviously-wrong shape before a database round trip is not a
 * security property — the hash comparison is — but it keeps a stale
 * `mps.recent_order` value (an order number, which is now meaningless here)
 * from being hashed and looked up on every page load.
 */
export function isOrderGrantShape(value: string | null | undefined): value is string {
  if (!value) return false;
  // 32 bytes in base64url is 43 characters, unpadded.
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}
