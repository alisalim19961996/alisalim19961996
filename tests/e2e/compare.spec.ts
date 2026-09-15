import { expect, test, type Page } from '@playwright/test';
import { gotoRendered, scrollToSettledBottom, t } from './fixtures';

/**
 * Comparing products, in a browser.
 *
 * Two claims and neither can be made below this level. The first is that a
 * comparison SURVIVES BEING SENT: the ticks live in `localStorage` but the
 * table is built from `?ids=`, so the page has to render for somebody who
 * never ticked anything — a second browser context is the only way to ask.
 *
 * The second is that the tray does not cover the footer. A bar pinned to the
 * bottom of the viewport is exactly the shape of the bug that shipped with the
 * mobile buy bar and went unmeasured for a phase (§15), so this measures it
 * rather than trusting that `sticky` behaves.
 */

/*
  `exact: true` on every match of `compare.compare`, and it is not fussiness.
  Playwright matches accessible names by SUBSTRING, and the Arabic for
  "compare" — قارن — is a substring of the card tick's own label, المقارنة. The
  tray's one button resolved to fifteen elements, and the assertion that the
  tray is absent before anything is ticked failed against the ticks themselves.
*/
const tick = (page: Page, index: number) =>
  page
    .locator('main li')
    .nth(index)
    .getByRole('button', { name: t('compare.add') });

test('ticking two products builds a comparison that can be sent to somebody', async ({
  page,
  browser,
}) => {
  await gotoRendered(page, '/ar/products?stock=1');

  // The tray is absent until something is ticked, which is almost every page
  // view — so its default has to be "not there at all", not "there and empty".
  await expect(
    page.getByRole('button', { name: t('compare.compare'), exact: true }),
  ).toHaveCount(0);

  await tick(page, 0).click();
  await tick(page, 1).click();

  const compare = page.getByRole('link', { name: t('compare.compare'), exact: true });
  await expect(compare).toBeVisible();
  await compare.click();

  await expect(page).toHaveURL(/\/ar\/compare\?ids=/);
  await expect(page.getByRole('heading', { name: t('compare.title') })).toBeVisible();

  const table = page.locator('main table');
  await expect(table).toBeVisible();

  // Two products plus the specification column. Counting the header cells is
  // what makes this a test of the table rather than of the URL: a column that
  // silently failed to load would still leave the link looking right.
  await expect(table.locator('thead th')).toHaveCount(3);

  const shared = page.url();

  await test.step('and the link works for someone who ticked nothing', async () => {
    /*
      A fresh context has an empty localStorage, so if the page depended on the
      ticks rather than on the query string this renders the empty state. That
      is the entire reason the comparison lives in the URL (§8).
    */
    const stranger = await browser.newContext();
    try {
      const strangerPage = await stranger.newPage();
      await strangerPage.goto(shared);
      await expect(
        strangerPage.getByRole('heading', { name: t('compare.title') }),
      ).toBeVisible();
      await expect(strangerPage.locator('main table thead th')).toHaveCount(3);
    } finally {
      await stranger.close();
    }
  });
});

test('a comparison of nothing says so instead of rendering an empty table', async ({
  page,
}) => {
  // Hand-typed, and every value is refused: the page is reached by URL, so the
  // parameter comes from anyone.
  await gotoRendered(page, '/ar/compare?ids=../../etc/passwd,<script>');
  await expect(
    page.getByRole('heading', { name: t('compare.emptyTitle') }),
  ).toBeVisible();
  await expect(page.locator('main table')).toHaveCount(0);
});

test('the tray never covers the footer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await gotoRendered(page, '/ar/products?stock=1');
  await tick(page, 0).click();
  await expect(
    page.getByRole('button', { name: t('compare.compare'), exact: true }),
  ).toBeVisible();

  /*
    The shared helper, not a scroll of this test's own. One `scrollTo` lands
    short — images finish loading and the document grows underneath — and the
    first version of this test measured from there: the footer was still below
    the viewport, the arithmetic came out negative, and the test passed against
    a tray that was covering it. §17 lists mid-scroll readings as a trap and
    this is the second time it has been paid for.
  */
  await scrollToSettledBottom(page);

  const overlap = await page.evaluate((label: string) => {
    const footer = document.querySelector('footer');
    /*
      Found by what it IS, not by how it is positioned. `sticky` is how this
      tray clears the footer today, but the claim under test is "the bar does
      not cover the footer" — and a test that only recognises sticky reports a
      switch to fixed as a missing element rather than as the overlap it may
      or may not be.
    */
    const control = [...document.querySelectorAll('button, a')].find(
      (element) => element.textContent?.trim() === label,
    );
    let tray = control?.parentElement ?? null;
    while (tray && !['sticky', 'fixed'].includes(getComputedStyle(tray).position)) {
      tray = tray.parentElement;
    }
    if (!footer || !tray) return null;

    const footerTop = footer.getBoundingClientRect().top;
    const trayBottom = tray.getBoundingClientRect().bottom;
    return Math.round((trayBottom - footerTop) * 100) / 100;
  }, t('compare.compare'));

  expect(overlap, 'no pinned tray was on the page to measure').not.toBeNull();
  // At rest the tray sits ABOVE the footer, so its bottom edge is at or before
  // the footer's top. Sticky keeps it in flow, which is why this holds without
  // a spacer — a fixed bar needs one whose height matches content that wraps.
  expect(overlap ?? 0).toBeLessThanOrEqual(1);
});
