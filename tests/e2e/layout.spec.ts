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

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('the buy bar never covers the footer', async ({ page }) => {
    await openPurchasableProduct(page);
    await scrollToSettledBottom(page);

    /*
      The bar is found by what it IS to a customer — an element pinned to the
      bottom of the viewport — rather than by a class name, so a restyle does
      not quietly turn this test into one that measures nothing.
    */
    const bar = await page.evaluate(() => {
      const pinned = [...document.querySelectorAll('div')].find((element) => {
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
        [...document.querySelectorAll('div')].filter((element) => {
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

for (const width of [PHONE, DESKTOP]) {
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
