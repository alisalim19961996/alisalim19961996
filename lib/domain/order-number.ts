/**
 * Human-facing order references, e.g. MPS-25091-0042.
 *
 * The customer reads this number over the phone to a delivery agent and types
 * it into the tracking page, so it is short, unambiguous and free of characters
 * that look alike. It is deliberately NOT the database id: a cuid is unusable
 * out loud, and exposing row identity invites enumeration.
 *
 * Shape: MPS-<YY><DDD>-<NNNN>
 *   YY   two-digit year
 *   DDD  day of the year, 001-366 — compact and sortable, and it makes
 *        "how many orders on the 4th of March" answerable from the number
 *   NNNN the order's sequence within that day, zero-padded
 */

export const ORDER_NUMBER_PREFIX = 'MPS';

/** Day of the year, 1-366, in UTC. */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const current = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  return Math.floor((current - start) / 86_400_000);
}

/** The `<YY><DDD>` segment shared by every order placed on the same day. */
export function orderNumberDayKey(date: Date): string {
  const year = String(date.getUTCFullYear() % 100).padStart(2, '0');
  return `${year}${String(dayOfYear(date)).padStart(3, '0')}`;
}

/**
 * Build an order number from the day and a sequence.
 *
 * The sequence keeps growing past 9999 rather than wrapping: a wrapped number
 * would collide with an existing order, and a slightly longer reference on the
 * day MPS sells ten thousand phones is a good problem to have.
 */
export function formatOrderNumber(date: Date, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`order sequence must be a positive integer, got ${sequence}`);
  }
  const suffix = String(sequence).padStart(4, '0');
  return `${ORDER_NUMBER_PREFIX}-${orderNumberDayKey(date)}-${suffix}`;
}

const ORDER_NUMBER_PATTERN = /^MPS-\d{5}-\d{4,}$/;

/**
 * Accept what a customer actually types.
 *
 * They paste it with spaces, lowercase it, use an Arabic-Indic keyboard, or
 * drop the prefix entirely because the confirmation page showed it in large
 * type. Tracking should find their order in all of those cases rather than
 * saying "not found" and losing the sale's goodwill.
 */
export function normalizeOrderNumber(input: string): string | null {
  const latin = input.replace(/[٠-٩۰-۹]/g, (digit) =>
    String(
      digit.charCodeAt(0) >= 0x06f0
        ? digit.charCodeAt(0) - 0x06f0
        : digit.charCodeAt(0) - 0x0660,
    ),
  );

  const cleaned = latin
    .trim()
    .toUpperCase()
    .replace(/[\s‏‎]/g, '')
    .replace(/[–—_]/g, '-');

  const withPrefix = /^\d/.test(cleaned)
    ? `${ORDER_NUMBER_PREFIX}-${cleaned}`
    : cleaned;

  return ORDER_NUMBER_PATTERN.test(withPrefix) ? withPrefix : null;
}
