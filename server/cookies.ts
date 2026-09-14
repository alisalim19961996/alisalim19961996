import 'server-only';

import { serverEnv } from '@/config/env';

/**
 * Cookie options for everything MPS sets itself.
 *
 * **`secure` follows `BETTER_AUTH_URL`'s scheme, never `NODE_ENV`.** This is
 * the same rule §7 records for the session cookie — and the three cookies that
 * predate this file each carried the NODE_ENV version, so the bug it describes
 * was still live in all of them:
 *
 * `pnpm start` sets NODE_ENV=production. On http://localhost that marked every
 * cookie `Secure`, and the browser silently refuses to store a Secure cookie
 * over http. Nothing errors. The cart token is minted fresh on every click, so
 * the cart is permanently empty; `mps.recent_order` never sticks, so a guest
 * cannot open the confirmation page for the order they just placed. Found by
 * driving the built site and noticing two carts had been created by two
 * clicks.
 *
 * curl stores cookies regardless of the flag, which is why an API poked with
 * curl looks perfectly healthy while every browser is broken.
 */
const useSecureCookies = serverEnv.BETTER_AUTH_URL.startsWith('https://');

export interface AppCookieOptions {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
}

/**
 * `httpOnly` always: none of these are read by client JavaScript, and a cart
 * token or a recent-order number in `document.cookie` is one XSS away from
 * being somebody else's.
 */
export function appCookieOptions(maxAge: number): AppCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: useSecureCookies,
    path: '/',
    maxAge,
  };
}
