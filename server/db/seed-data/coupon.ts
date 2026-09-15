/**
 * The demo discount code.
 *
 * Its own module because three places need the same spelling and §13.16 allows
 * exactly one: the seed that creates the row, the e2e test that spends it at
 * checkout, and the Arabic guide that tells the owner what to type to see the
 * box work. A code hard-coded in the test would pass against a database that
 * no longer has it.
 *
 * Demo data, like everything else the seed writes — `pnpm db:seed` refuses to
 * run in production.
 */
export const DEMO_COUPON_CODE = 'MPS10';

/** Percent off, capped — the shape an owner is most likely to copy. */
export const DEMO_COUPON_PERCENT = 10;
export const DEMO_COUPON_MAX_DISCOUNT_IQD = 25_000;
export const DEMO_COUPON_MIN_ORDER_IQD = 50_000;
