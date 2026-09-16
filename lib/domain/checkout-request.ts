import { createHash } from 'node:crypto';

/**
 * The key that makes one confirmation attempt happen once.
 *
 * Checkout had no such thing. `placeOrder` read the cart, wrote the order and
 * emptied the cart in one transaction — but Postgres runs at READ COMMITTED,
 * so two submissions that overlap both see the lines, both write an order, and
 * both delete the same rows. The customer is charged twice for one basket, and
 * the only thing standing in the way was a button the browser disables, which
 * a second tab, a slow network or a double tap all get past.
 *
 * The browser generates a `crypto.randomUUID()` once per checkout page and
 * sends it with every attempt from that page. The value stored is NOT that id:
 * it is the hash of the id together with the cart the server resolved for this
 * request. That scoping is the security property. A bare id would be an
 * unguessable string a client chooses, so guessing somebody else's would replay
 * THEIR order back — order number and all — to whoever asked. Mixing in the
 * cart id, which never comes from the client, means a key can only ever match
 * an order placed from the cart in front of you.
 */

/** What the browser sends: a UUID, and nothing else is accepted. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCheckoutRequestId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * Null when the browser sent nothing usable, so an old page or a client with
 * no `crypto.randomUUID` still checks out — it simply loses the replay
 * protection, and the cart row lock still stops the double order.
 */
export function checkoutIdempotencyKey(
  cartId: string,
  requestId: unknown,
): string | null {
  if (!isCheckoutRequestId(requestId)) return null;
  return createHash('sha256').update(`${cartId}:${requestId}`).digest('hex');
}
