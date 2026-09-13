/**
 * Recognising a connection string that was never filled in.
 *
 * Copying `.env.example` to `.env` and leaving it as-is is the single most
 * common way a first run fails, and the placeholder passes a "non-empty
 * string" check happily. It then surfaces three layers later as
 * `Authentication failed ... for \`user\``, which names the database rather
 * than the file that is actually wrong.
 *
 * Lives in lib/ rather than config/ so it can be unit-tested: importing
 * config/env.ts runs the whole validation as a side effect.
 */

/**
 * Tokens that only ever appear in the template.
 *
 * Matched in position — `://USER:` rather than merely "USER" — so a real
 * deployment whose role genuinely is called `user` is not refused.
 */
const PLACEHOLDERS: readonly RegExp[] = [
  /:\/\/USER:/,
  /:PASSWORD@/,
  /@HOST[:/]/,
  /\/DATABASE(\?|$)/,
];

/** True when the connection string is still the example from `.env.example`. */
export function isPlaceholderDatabaseUrl(url: string): boolean {
  return PLACEHOLDERS.some((pattern) => pattern.test(url));
}
