import { expect, test } from '@playwright/test';
import {
  gotoRendered,
  openPurchasableProduct,
  scrollToSettledBottom,
  t,
} from './fixtures';

/**
 * The two layout claims in §10 that can regress without anybody noticing.
 *
 * `pnpm check:layout` is the owner's interactive tool: it measures card
 * widths and image heights against a dev server they already have open. What
 * it cannot do is run in CI, and it has never measured the one thing §15 still
 * lists as checked by hand — the gap the footer reserves under the mobile buy
 * bar. Both of those live here instead.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

/**
 * The five widths the plan names, narrowest first.
 *
 * 360 is the narrowest Android still in common use in Iraq and is where an
 * overflow shows up first — a layout that fits 390 can still push 6px past 360.
 * 1920 is the other end: a container that stops growing is correct, a element
 * that escapes it is not. 768 is the tablet break, where the catalogue goes
 * from two columns to three and the filter drawer becomes a sidebar.
 */
const WIDTHS = [
  { width: 360, height: 800 },
  PHONE,
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  DESKTOP,
  { width: 1920, height: 1080 },
];

test.describe('typography', () => {
  /*
    The Arabic store was drawing its Arabic in **Arial**, and no screenshot
    review would have named the cause: next/font packs a second face into
    `--font-latin` called "Inter Fallback", whose source is `local("Arial")`.
    Arial has Arabic glyphs, so the stack was satisfied one step before
    reaching IBM Plex Sans Arabic. The documented switch for that face
    (`adjustFontFallback: false`) does nothing under Turbopack, so the fix is
    the CSS ordering — and this is what stops it silently coming back.

    Asserted as "which family wins", not "the stack contains it": the old,
    broken build contained IBM Plex Sans Arabic too. It was just never reached.
  */
  test('Arabic pages resolve to the Arabic face, English pages to the Latin one', async ({
    page,
  }) => {
    const firstFamily = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) =>
          getComputedStyle(element).fontFamily.split(',')[0]!.trim().replace(/"/g, ''),
        );

    await gotoRendered(page, '/ar');
    expect(await firstFamily('body')).toBe('IBM Plex Sans Arabic');
    // The heading too: a heading that picked up a different family is exactly
    // the "incidental difference between the button, the field and the title"
    // the review described.
    expect(await firstFamily('main h1')).toBe('IBM Plex Sans Arabic');

    await gotoRendered(page, '/en');
    expect(await firstFamily('body')).toBe('Inter');
  });

  test('the hero stays inside its size ceiling at both ends', async ({ page }) => {
    await gotoRendered(page, '/ar');

    const size = async () =>
      page
        .locator('main h1')
        .first()
        .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));

    // It was 60px — past the ceiling — because it stepped through three
    // breakpoints instead of scaling. The clamp lands on 56 at the container's
    // full width and bottoms out at 30 on a phone.
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await size()).toBeLessThanOrEqual(56);

    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await size();
    expect(phone).toBeGreaterThanOrEqual(28);
    expect(phone).toBeLessThanOrEqual(36);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('the buy bar never covers the footer', async ({ page }) => {
    await openPurchasableProduct(page);
    await scrollToSettledBottom(page);

    /*
      The bar is found by what it IS to a customer — an element pinned to the
      bottom of the viewport — rather than by a class name, so a restyle does
      not quietly turn this test into one that measures nothing.

      `*`, not `div`: the bar became a named `<section>` when it was given an
      accessible name, and a div-only sweep then found nothing and reported
      "no buy bar" — a test that fails safe, which is the right direction, but
      only because somebody read the message.
    */
    const bar = await page.evaluate(() => {
      const pinned = [...document.querySelectorAll('*')].find((element) => {
        if (getComputedStyle(element).position !== 'fixed') return false;
        const box = element.getBoundingClientRect();
        return box.height > 0 && Math.abs(box.bottom - window.innerHeight) < 2;
      });
      return pinned ? { top: pinned.getBoundingClientRect().top } : null;
    });

    expect(bar, 'no buy bar was pinned to the bottom of a product page').not.toBeNull();

    // Matched on its text, not `footer p:last-of-type` — that selector picks
    // the tagline, because it is the last `p` among its OWN siblings (§17).
    const copyright = page
      .locator('footer p')
      .filter({ hasText: t('brand.fullName') })
      .first();
    const box = await copyright.boundingBox();
    expect(box, 'the footer rendered no copyright line').not.toBeNull();

    const clearance = bar!.top - (box!.y + box!.height);
    expect(
      clearance,
      `the buy bar overlaps the copyright line by ${Math.abs(clearance)}px — ` +
        `the footer reserves --mobile-buy-bar-height for exactly this`,
    ).toBeGreaterThan(0);
  });

  test('the buy bar is gone at desktop width', async ({ page }) => {
    await openPurchasableProduct(page);
    await page.setViewportSize(DESKTOP);
    await scrollToSettledBottom(page);

    // `lg:hidden`. The picker's own buttons are the controls at this width, and
    // a bar floating over a 1440px page would cover the footer with nothing
    // reserving room for it.
    const pinned = await page.evaluate(
      () =>
        [...document.querySelectorAll('*')].filter((element) => {
          if (getComputedStyle(element).position !== 'fixed') return false;
          const box = element.getBoundingClientRect();
          return box.height > 0 && Math.abs(box.bottom - window.innerHeight) < 2;
        }).length,
    );

    expect(pinned, 'something is still pinned to the bottom at 1440px').toBe(0);
  });
});

/**
 * Sideways scroll, which §10 forbids on every page at both widths.
 *
 * It is the failure mode Arabic makes easy — one `mr-` instead of `me-`, one
 * element wider than its column — and it is invisible on the machine of
 * whoever introduced it, because a trackpad scrolls horizontally without
 * anything looking wrong.
 */
const PAGES = ['/ar', '/ar/products', '/ar/cart', '/ar/track', '/en', '/en/products'];

for (const width of WIDTHS) {
  test(`no page scrolls sideways at ${width.width}px`, async ({ page }) => {
    await page.setViewportSize(width);

    for (const path of PAGES) {
      await gotoRendered(page, path);

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

      expect(overflow, `${path} scrolls ${overflow}px sideways`).toBeLessThanOrEqual(0);
    }
  });
}
