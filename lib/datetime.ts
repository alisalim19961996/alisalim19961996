/**
 * How MPS prints a date.
 *
 * Two decisions, both of which had already been made differently on different
 * screens before this existed.
 *
 * **Baghdad, always.** A date rendered in the server's timezone is a different
 * day for anything placed or scheduled after 21:00 UTC. The dashboard is where
 * that matters most: a guide scheduled for Friday showing as Thursday, or an
 * order placed after midnight filed under yesterday, makes the screen look
 * wrong about something the owner can check by looking at their phone.
 *
 * **Latin digits in both languages.** The same rule prices and SKUs follow
 * (§11): that is how numbers are written in Iraqi commerce, and a table that
 * mixes ٢٠٢٦ into one column and 2026 into the next cannot be scanned.
 * `ar-IQ` defaults to Arabic-Indic, so the `-u-nu-latn` extension is required
 * rather than decorative.
 *
 * Framework-free and pure, so a test can assert both without a browser.
 */

export const STORE_TIME_ZONE = 'Asia/Baghdad';

type DateLength = 'short' | 'medium' | 'long';

function localeTag(locale: string): string {
  return locale === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB';
}

/** A date with no time: lists, published-on columns, expiry dates. */
export function dateFormatter(
  locale: string,
  dateStyle: DateLength = 'short',
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(localeTag(locale), {
    dateStyle,
    timeZone: STORE_TIME_ZONE,
  });
}

/** A date and a time: order queues and timelines, where the hour is the point. */
export function dateTimeFormatter(
  locale: string,
  dateStyle: DateLength = 'short',
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(localeTag(locale), {
    dateStyle,
    timeStyle: 'short',
    timeZone: STORE_TIME_ZONE,
  });
}
