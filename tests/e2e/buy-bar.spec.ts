import { expect, test, type Page } from '@playwright/test';
import { gotoRendered, readPrices, scrollToSettledBottom, t } from './fixtures';

/**
 * The mobile buy bar adds what the shopper actually chose.
 *
 * It used to add `product.variants[0]`, which the page called `cheapest`
 * although that query orders by `sortOrder` — so a shopper who picked 256GB in
 * Blue scrolled down and added 128GB in Black at a different price, and did not
 * find out until the cart. A product whose first variant happened to be sold
 * out showed a permanently disabled bar under a page that was selling fine.
 *
 * Driven in a phone-sized browser because the bar exists nowhere else and only
 * after 520px of scrolling: this is a claim about two controls on one screen
 * agreeing, which no unit or integration test can make.
 */

test.use({ viewport: { width: 390, height: 780 } });

/** The picker's own price — the first one rendered above the buy controls. */
async function pickerPrice(page: Page): Promise<number> {
  const prices = await readPrices(page.locator('main').first());
  return prices[0] ?? 0;
}

test('the buy bar follows the variant the shopper picked', async ({ page }) => {
  await gotoRendered(page, '/ar/products?stock=1');

  const links = await page
    .locator('main a[href*="/ar/products/"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));

  const addToCart = () =>
    page.getByRole('button', { name: t('product.addToCart') }).first();

  let chosenPrice: number | null = null;

  /*
    Look for a product where a DIFFERENT, still-buyable choice changes the
    price. Without that the assertion below would compare a number with itself
    and pass against the bug it exists to catch.
  */
  for (const href of links.slice(0, 10)) {
    await gotoRendered(page, href);
    if (!(await addToCart().isEnabled())) continue;

    const opened = await pickerPrice(page);
    const values = page.locator('main fieldset button');

    for (let index = 0; index < (await values.count()); index += 1) {
      const value = values.nth(index);
      await value.click();
      // Enabled means reachable, which is not the same as purchasable: the
      // picker dims a combination that exists but cannot be bought.
      if (!(await addToCart().isEnabled())) continue;

      const now = await pickerPrice(page);
      if (now !== opened && now > 0) {
        chosenPrice = now;
        break;
      }
    }

    if (chosenPrice !== null) break;
  }

  test.skip(
    chosenPrice === null,
    'no product in the demo catalogue offers two buyable variants at two prices',
  );

  await scrollToSettledBottom(page);

  // By its region name, not by the button inside it: the button's label flips
  // to "added" the moment it works, so a locator filtered on that label finds
  // nothing exactly when the test needs it most.
  const bar = page.getByRole('region', { name: t('product.buyBarLabel') });
  await expect(bar).toBeVisible();

  // The bar prints the price of the SELECTED variant, not of whichever one the
  // query happened to return first.
  expect(
    (await readPrices(bar))[0],
    'the buy bar is showing a different price from the picker',
  ).toBe(chosenPrice);

  const barButton = bar.getByRole('button', { name: t('product.addToCart') });
  await expect(
    barButton,
    'the bar is disabled while the page is selling',
  ).toBeEnabled();
  await barButton.click();

  // The BAR's own button, not `.first()` on the page — that one is the picker's,
  // which would go green without the bar having done anything.
  await expect(bar.getByRole('button', { name: t('cart.itemAdded') })).toBeVisible();

  // And the cart holds that variant. The price is what proves which one.
  await gotoRendered(page, '/ar/cart');
  expect(
    await readPrices(page.locator('main').first()),
    'the cart holds a variant the shopper did not choose',
  ).toContain(chosenPrice);
});
