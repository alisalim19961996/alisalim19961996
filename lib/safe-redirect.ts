/**
 * Where a redirect taken from a query string is allowed to go.
 *
 * `/api/session/claim-cart?next=…` is a public GET: anybody can craft the
 * link, and a customer who follows it has just proved to themselves that they
 * are on the real store. Sending them anywhere else from there is a phishing
 * primitive with the shop's own domain on it.
 *
 * The check this replaces was `startsWith('/') && !startsWith('//')`, and it
 * was bypassed live: **`/\evil.example` redirected to `http://evil.example/`**.
 * The WHATWG URL parser treats a backslash as a forward slash for http(s), so
 * `/\evil` and `//evil` are the same URL — a rule the string check knows
 * nothing about, and the kind of rule that will gain another case next year.
 *
 * So this does not try to out-guess the parser. It hands the value to the SAME
 * parser that will resolve it, against a throwaway origin, and accepts the
 * result only if the origin survived. Whatever the parser does with
 * backslashes, tabs, newlines or anything added later, a value that can reach
 * another host changes the origin and is refused.
 */

/** Deliberately unreachable: `.invalid` is reserved by RFC 2606. */
const PROBE_ORIGIN = 'http://internal.invalid';

export function safeInternalPath(
  raw: string | null | undefined,
  fallback = '/',
): string {
  // Must be root-relative. A scheme, a bare host or an empty value is refused
  // before the parser is involved at all.
  if (!raw || !raw.startsWith('/')) return fallback;

  let probe: URL;
  try {
    probe = new URL(raw, PROBE_ORIGIN);
  } catch {
    return fallback;
  }

  if (probe.origin !== PROBE_ORIGIN) return fallback;

  // Rebuilt from the parsed parts rather than returned as given, so the value
  // that reaches `NextResponse.redirect` is the one this function inspected.
  return `${probe.pathname}${probe.search}${probe.hash}`;
}
