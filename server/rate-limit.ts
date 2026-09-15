import 'server-only';

import { hitWindow, pruneWindows, type WindowState } from '@/lib/domain/rate-limit';

/**
 * In-process rate limiting for the one public form that answers with a
 * customer's name, phone number and home address.
 *
 * better-auth limits everything under `/api/auth/*` (§7), but a Server Action
 * is a separate door and nothing was watching it. Order tracking takes an
 * order number and a phone; order numbers are sequential by design — they have
 * to be readable aloud to a courier — so anyone who knows a customer's phone
 * number could walk the four-digit sequence for a day and read back their
 * order. Ten thousand requests is an afternoon.
 *
 * **Keyed by the submitted phone number, not the IP.** That is the key the
 * attack cannot vary: enumerating order numbers for one person means sending
 * that person's phone every time, while an IP is both easy to rotate and, from
 * a Server Action behind a proxy, only as trustworthy as an `x-forwarded-for`
 * header anyone can write. A legitimate customer needs one or two attempts.
 *
 * **In process, so it does not survive a restart and is not shared between
 * instances.** That is a real limit and it is the honest trade: the store runs
 * one Next process against one Postgres today, and a counter table would be a
 * migration and a write on every attempt. Revisit when there is a second
 * instance to keep in step.
 */

const store = (() => {
  // Cached on globalThis for the same reason the Prisma client is: a hot
  // reload in development would otherwise hand every edit a fresh, empty map.
  const global = globalThis as unknown as { mpsRateLimit?: Map<string, WindowState> };
  global.mpsRateLimit ??= new Map<string, WindowState>();
  return global.mpsRateLimit;
})();

/**
 * Five attempts per quarter hour, per phone number.
 *
 * A customer who mistypes their order number twice is unaffected. An attacker
 * walking a day's sequence gets 480 guesses a day against ten thousand
 * numbers, which is three weeks of sustained traffic for one order — enough
 * that it is not worth doing, without a number a real customer could hit.
 */
export const TRACK_ORDER_LIMIT = { windowMs: 15 * 60_000, max: 5 } as const;

export interface LimitDecision {
  allowed: boolean;
  retryAfterMs: number;
}

export function takeTrackOrderAttempt(phone: string): LimitDecision {
  const now = Date.now();

  // Pruned on the way in: the keys are whatever the form is sent, so an
  // untended map is an unbounded leak anyone can fill.
  pruneWindows(store, now);

  const key = `track:${phone}`;
  const decision = hitWindow(store.get(key), { ...TRACK_ORDER_LIMIT, now });
  store.set(key, decision.state);

  return { allowed: decision.allowed, retryAfterMs: decision.retryAfterMs };
}
