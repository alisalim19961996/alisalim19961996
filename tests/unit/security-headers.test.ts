import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, securityHeaders } from '@/lib/security-headers';
import { YOUTUBE_EMBED_ORIGIN, YOUTUBE_THUMBNAIL_ORIGIN } from '@/lib/video';

/** "img-src 'self' data: …" → ["'self'", 'data:', …] */
function directive(policy: string, name: string): string[] {
  const found = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));

  expect(found, `the policy has no ${name} directive`).toBeDefined();
  return found!.split(/\s+/).slice(1);
}

describe('contentSecurityPolicy', () => {
  const policy = contentSecurityPolicy({
    storageHost: 'abc.supabase.co',
    secure: true,
  });

  it('allows the two YouTube origins the product gallery actually loads', () => {
    // Read from lib/video.ts, not written out: the gallery's <iframe> and its
    // thumbnail <img> point at these, and a policy that names them separately
    // starts disagreeing the first time one of them changes.
    expect(directive(policy, 'frame-src')).toContain(YOUTUBE_EMBED_ORIGIN);
    expect(directive(policy, 'img-src')).toContain(YOUTUBE_THUMBNAIL_ORIGIN);
  });

  it('allows the storage bucket only when one is configured', () => {
    expect(directive(policy, 'img-src')).toContain('https://abc.supabase.co');

    const withoutStorage = contentSecurityPolicy({ secure: true });
    expect(
      directive(withoutStorage, 'img-src').some((source) =>
        source.includes('supabase'),
      ),
    ).toBe(false);
  });

  it('never allows eval, and never a remote script', () => {
    const scripts = directive(policy, 'script-src');
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(scripts.filter((source) => source.startsWith('http'))).toEqual([]);
  });

  it.each([
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ])('pins %s to %s', (name, expected) => {
    // These four are the whole point of a policy that cannot drop
    // 'unsafe-inline': an injected <base> repointing the checkout form, a form
    // aimed at another host, the page in somebody's frame, a plugin.
    expect(directive(policy, name)).toEqual([expected]);
  });

  it('upgrades insecure requests only on https', () => {
    expect(policy).toContain('upgrade-insecure-requests');
    expect(contentSecurityPolicy({ secure: false })).not.toContain(
      'upgrade-insecure-requests',
    );
  });
});

describe('securityHeaders', () => {
  const keys = (secure: boolean) =>
    securityHeaders({ secure }).map((header) => header.key);

  it('sends HSTS on https and never on http', () => {
    // Over http it is not merely useless: a browser that honoured it would
    // then refuse http to the same host, which on localhost reads as the site
    // being down.
    expect(keys(true)).toContain('Strict-Transport-Security');
    expect(keys(false)).not.toContain('Strict-Transport-Security');
  });

  it('does not preload HSTS', () => {
    // Close to irreversible, and this store has no domain yet.
    const hsts = securityHeaders({ secure: true }).find(
      (header) => header.key === 'Strict-Transport-Security',
    );
    expect(hsts?.value).not.toContain('preload');
  });

  it('keeps X-Frame-Options agreeing with frame-ancestors', () => {
    const headers = securityHeaders({ secure: true });
    const legacy = headers.find((header) => header.key === 'X-Frame-Options');
    const csp = headers.find((header) => header.key === 'Content-Security-Policy');

    expect(legacy?.value).toBe('DENY');
    expect(csp?.value).toContain("frame-ancestors 'none'");
  });
});
