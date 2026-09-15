import { YOUTUBE_EMBED_ORIGIN, YOUTUBE_THUMBNAIL_ORIGIN } from './video';

/**
 * The response headers that do not depend on what a page renders.
 *
 * Built here rather than written out in `next.config.ts` so the policy can be
 * unit-tested — a header that silently blocks the product video or silently
 * allows everything looks identical in a config file.
 */

export interface SecurityHeader {
  key: string;
  value: string;
}

/**
 * Content-Security-Policy, **without a nonce**, and that is a decision.
 *
 * Next's own guide builds a strict `script-src` from a per-request nonce, and
 * says plainly that doing so **requires dynamic rendering**. This store is
 * built the other way round: the homepage and all 32 product pages are
 * prerendered, and §8 records what it cost to keep them that way — the header
 * cannot even read a cookie without turning every route dynamic. Trading that
 * for a nonce would make every visitor wait on a render to gain a defence
 * against inline script, in an app that renders no user HTML: React escapes
 * everything, and the single `dangerouslySetInnerHTML` is JSON-LD, now
 * serialised so it cannot close its own tag (`lib/seo.ts`).
 *
 * So `'unsafe-inline'` stays on script-src, and this policy is honest about
 * what it is: it does not stop inline script. What it does stop is the rest of
 * the injection surface, and those are not consolation prizes —
 *
 *  - `script-src` without `'unsafe-eval'` and with no remote origin: an
 *    injected `<script src="https://evil/">` does not load, and nothing can
 *    reach `eval`.
 *  - `base-uri 'self'`: an injected `<base>` cannot silently repoint every
 *    relative URL on the page, including the ones the checkout form posts to.
 *  - `form-action 'self'`: a form cannot be aimed at another host. This store
 *    has a checkout that collects a name, a phone number and an address.
 *  - `frame-ancestors 'none'`: the modern X-Frame-Options, which is also kept
 *    for browsers that only read that one.
 *  - `object-src 'none'`: no plugins, ever.
 *  - `img-src` and `frame-src` are allow-lists, not wildcards: the storage
 *    bucket and the two YouTube origins `lib/video.ts` actually uses.
 *
 * Revisit if the storefront ever becomes dynamic for another reason — at that
 * point the nonce costs nothing and should be adopted.
 */
export function contentSecurityPolicy(options: {
  /** The Supabase Storage host, when uploads are configured. */
  storageHost?: string | undefined;
  /** Https deployments get `upgrade-insecure-requests`; http localhost must not. */
  secure: boolean;
}): string {
  const imgSources = [
    "'self'",
    // Next's blur placeholders are data: URIs; blob: is the upload preview.
    'data:',
    'blob:',
    YOUTUBE_THUMBNAIL_ORIGIN,
    ...(options.storageHost ? [`https://${options.storageHost}`] : []),
  ];

  const directives = [
    "default-src 'self'",
    // See the note above: no nonce, and therefore no honest way to drop
    // 'unsafe-inline' without making every page dynamic.
    "script-src 'self' 'unsafe-inline'",
    // Tailwind ships a stylesheet, but `style={{…}}` props are inline styles
    // and there are four of them in the app.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSources.join(' ')}`,
    "font-src 'self'",
    // Server Actions post to this origin. Nothing else is called from the
    // browser: Supabase and Resend are only ever reached from the server.
    "connect-src 'self'",
    `frame-src ${YOUTUBE_EMBED_ORIGIN}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(options.secure ? ['upgrade-insecure-requests'] : []),
  ];

  return directives.join('; ');
}

/**
 * Everything sent on every response.
 *
 * `Strict-Transport-Security` follows the scheme the site is served from, the
 * same rule every cookie follows (§7). Sending it over http is not merely
 * useless — a browser that later reaches the same host over http would refuse
 * the connection outright, which on a developer's machine reads as the site
 * being down.
 *
 * No `preload`. Submitting a domain to the browsers' preload list is close to
 * irreversible, and this store does not have its domain yet (§19) — that is a
 * decision for the day it does, not a default to inherit.
 */
export function securityHeaders(options: {
  storageHost?: string | undefined;
  secure: boolean;
}): SecurityHeader[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(options) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Superseded by frame-ancestors above, kept for browsers that read only
    // this. The two must agree: both say "never framed".
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ...(options.secure
      ? [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
        ]
      : []),
  ];
}
