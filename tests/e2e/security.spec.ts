import { expect, test, type Page } from '@playwright/test';
import { gotoRendered, t, tPrefix } from './fixtures';

/**
 * The headers and the one redirect a visitor can aim.
 *
 * A Content-Security-Policy is the guardrail most likely to be right in a
 * config file and wrong in a browser: it breaks a third-party frame, or an
 * inline style, or nothing at all because a typo made it inert. The only way
 * to know is to load the pages and ask the browser what it refused.
 */

/**
 * Zod's JIT probe, and the only violation this policy is expected to produce.
 *
 * Zod 4 compiles validators with `new Function` when it can, and finds out by
 * trying: `try { Function(''); } catch { … }`. Under a policy without
 * `'unsafe-eval'` that throws, Zod catches it and falls back to the
 * interpreted path — correct, just slower, and every form on the site still
 * validates (the buying spec proves that end to end).
 *
 * It is named here rather than filtered away wholesale, so a genuinely new
 * violation — a script from another origin, a blocked frame — still fails.
 */
const EXPECTED_VIOLATION = 'script-src blocked eval';

type Violation = { directive: string; blocked: string };

async function collectViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: Violation[] = [];
    (window as unknown as { __violations: Violation[] }).__violations = seen;
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push({ directive: event.violatedDirective, blocked: event.blockedURI });
    });
  });
}

async function readViolations(page: Page): Promise<string[]> {
  const found = await page.evaluate(
    () => (window as unknown as { __violations?: Violation[] }).__violations ?? [],
  );
  return found.map(
    (violation) => `${violation.directive} blocked ${violation.blocked}`,
  );
}

const PAGES = [
  '/ar',
  '/ar/products',
  '/ar/cart',
  '/ar/checkout',
  '/ar/track',
  '/ar/sign-in',
  '/ar/sign-up',
  '/ar/brands',
  '/ar/offers',
  '/ar/guides',
  '/ar/about',
  '/ar/contact',
  '/en',
];

test('the policy blocks nothing the storefront needs', async ({ page }) => {
  await collectViolations(page);

  for (const path of PAGES) {
    await gotoRendered(page, path);

    const unexpected = (await readViolations(page)).filter(
      (violation) => violation !== EXPECTED_VIOLATION,
    );

    expect(unexpected, `${path} was refused something by the CSP`).toEqual([]);
  }
});

test('the product video still loads under the policy', async ({ page }) => {
  await collectViolations(page);
  await gotoRendered(page, '/ar/products/tecno-camon-40-demo');

  // The gallery is a facade: the video thumbnail selects the slide, and only
  // then is there a play button. The iframe is created by that second click —
  // which is the whole point of the facade, and the moment `frame-src` decides
  // whether the customer gets a video or an empty box.
  const videoThumb = page
    .getByRole('button', { name: new RegExp(`^${tPrefix('product.galleryVideo')}`) })
    .first();

  test.skip((await videoThumb.count()) === 0, 'this product has no video');

  await videoThumb.click();
  await page.getByRole('button', { name: t('product.playVideo') }).click();

  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    /^https:\/\/www\.youtube-nocookie\.com\//,
  );

  const frameViolations = (await readViolations(page)).filter((violation) =>
    violation.startsWith('frame-src'),
  );
  expect(frameViolations, 'the policy blocked the product video').toEqual([]);
});

test('every response carries the security headers', async ({ page }) => {
  const response = await page.goto('/ar');
  const headers = response?.headers() ?? {};

  const policy = headers['content-security-policy'] ?? '';
  expect(policy, 'no Content-Security-Policy on the homepage').not.toBe('');

  // The four directives that do real work in a policy which cannot drop
  // 'unsafe-inline' — see lib/security-headers.ts.
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("base-uri 'self'");
  expect(policy).toContain("form-action 'self'");
  expect(policy).toContain("frame-ancestors 'none'");

  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

  // Never over http: a browser that honoured it would then refuse http to the
  // same host, which on a developer's machine reads as the site being down.
  expect(headers['strict-transport-security']).toBeUndefined();
});

test('the cart-claim route will not forward a visitor off-site', async ({
  request,
}) => {
  /*
    `?next=/\evil.example` used to answer `Location: http://evil.example/`. The
    check was `startsWith('/') && !startsWith('//')`, and the URL parser reads
    a backslash as a slash — so the one shape the check was written to stop got
    through in a second spelling. Anyone could send that link; it carries the
    store's own domain, and the customer following it has just watched
    themselves sign in.
  */
  const hostile = ['//evil.example', '/\\evil.example', '/\\\\evil.example'];

  for (const next of hostile) {
    const response = await request.get(
      `/api/session/claim-cart?next=${encodeURIComponent(next)}`,
      { maxRedirects: 0 },
    );

    const location = response.headers()['location'] ?? '';
    expect(
      new URL(location).host,
      `next=${next} forwarded the visitor to ${location}`,
    ).toBe(new URL(response.url()).host);
  }
});
