import { expect, test, type Page } from '@playwright/test';
import { gotoRendered, t } from './fixtures';

/**
 * The catalogue's filters, driven.
 *
 * The price range is the reason this file exists. `getCatalogueFacets` has
 * computed `priceRange` since the catalogue was built and **nothing rendered
 * it**: `min` and `max` were in the URL contract, parsed and clamped, and
 * reachable only by typing them into the address bar. A filter nobody can
 * click is not a filter, and no unit test would have said so.
 */

const productLinks = (page: Page) => page.locator('main a[href*="/products/"]');

test('the price range narrows the catalogue and survives the URL', async ({ page }) => {
  await gotoRendered(page, '/ar/products');
  const before = await productLinks(page).count();
  expect(before, 'the catalogue rendered nothing to filter').toBeGreaterThan(1);

  /*
    Read off the placeholders rather than hard-coded in dinars: the prices are
    the owner's data, and a literal here would be a second copy of them
    (§13.13). The "to" box carries the most expensive product, so putting that
    in the "from" box keeps only the dearest — which is fewer than everything.
  */
  const boxes = page.locator('input[type="number"]');
  const ceiling = Number(await boxes.nth(1).getAttribute('placeholder'));
  expect(Number.isFinite(ceiling)).toBe(true);

  await boxes.first().fill(String(ceiling));
  await page.getByRole('button', { name: t('catalogue.priceApply') }).click();

  await expect(page).toHaveURL(/[?&]min=/);
  await expect.poll(() => productLinks(page).count()).toBeLessThan(before);

  await test.step('and the back button puts it back', async () => {
    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]min=/);
    await expect.poll(() => productLinks(page).count()).toBe(before);
  });
});

test('a filter change returns to the first page', async ({ page }) => {
  // Leaving page=4 after a filter narrows the results to one page shows an
  // empty grid, and a customer reads that as "you have nothing".
  await gotoRendered(page, '/ar/products?page=2');
  await page.locator('input[type="number"]').first().fill('1');
  // `1` is below every product's price on purpose: it proves the box is not
  // bounded to the facet range, which used to block submit outright.

  await page.getByRole('button', { name: t('catalogue.priceApply') }).click();

  await expect(page).toHaveURL(/[?&]min=1\b/);
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test('the filter drawer stays open while narrowing, and closes on the count', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoRendered(page, '/ar/products');

  await page.getByRole('button', { name: new RegExp(t('catalogue.filters')) }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();

  /*
    It used to close on the first tick, so picking a brand and a storage size
    meant opening it twice — and the results it was covering were hidden
    anyway. Ticking something must leave it open.
  */
  // The brand and specification filters are `aria-pressed` buttons, not
  // checkboxes — only the availability rows are checkboxes.
  await drawer.locator('button[aria-pressed]').first().click();
  await expect(drawer).toBeVisible();

  await drawer
    .getByRole('button', {
      name: new RegExp(t('catalogue.showResults').split('{')[0]!.trim()),
    })
    .click();
  await expect(drawer).toHaveCount(0);
});
