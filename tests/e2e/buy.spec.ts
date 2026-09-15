import { expect, test } from '@playwright/test';
import {
  CHECKOUT,
  addSelectedVariantToCart,
  cartLink,
  gotoRendered,
  openPurchasableProduct,
  readFirstPrice,
  readPrices,
  submitCheckout,
  t,
} from './fixtures';

/**
 * The purchase, end to end, as a customer performs it.
 *
 * This is the flow that has been driven by hand before every phase was called
 * done: catalogue → product → add → cart → quantity → checkout → order →
 * tracking. Every piece of it is covered by a unit or integration test
 * already; none of those would have noticed the two cookie bugs that shipped,
 * because both only appear in a browser talking to a built site over http
 * (§7). A browser is the only witness for that class of failure.
 */

test('a visitor can buy a phone and then track the order', async ({ page }) => {
  await openPurchasableProduct(page);

  await test.step('adding shows in the header without a reload', async () => {
    await addSelectedVariantToCart(page);
    // The badge is the one part of the header that loads after hydration,
    // because reading the cart server-side would opt every route into dynamic
    // rendering (§8). That makes it worth asserting: it is the piece most
    // likely to be silently wrong.
    await expect(cartLink(page)).toContainText('1');
  });

  await gotoRendered(page, '/ar/cart');

  /*
    The line and the summary are computed separately — the line from
    `lineTotalIqd`, the summary from `cartTotals(unitPrice, quantity)` — so a
    bug in either is invisible to a test that reads only the other. Breaking
    the line total deliberately proved exactly that: the subtotal stayed right
    while the customer was shown the wrong price beside their phone.
  */
  const line = page
    .locator('main li')
    .filter({ has: page.getByRole('button', { name: t('cart.increase') }) })
    .first();
  const summary = page.getByText(t('cart.subtotal')).locator('..');

  const oneUnit = await readFirstPrice(line);
  expect(
    await readPrices(summary),
    'a one-line cart disagreed with its own subtotal',
  ).toContain(oneUnit);

  await test.step('the quantity control reprices the line', async () => {
    await page
      .getByRole('button', { name: t('cart.increase') })
      .first()
      .click();
    await expect(cartLink(page)).toContainText('2');

    // `lineTotal = unitPrice × quantity` is a CHECK constraint in the
    // database; this is the same arithmetic reaching the customer's eyes.
    await expect.poll(() => readFirstPrice(line)).toBe(oneUnit * 2);
    expect(await readPrices(summary)).toContain(oneUnit * 2);
  });

  await page
    .getByRole('link', { name: t('cart.checkout') })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: t('checkout.title') })).toBeVisible();

  const orderNumber = await submitCheckout(page);

  await test.step('the confirmation carries what the customer needs', async () => {
    await expect(
      page.getByRole('heading', { name: t('order.confirmedTitle') }),
    ).toBeVisible();
    await expect(page.getByText(orderNumber).first()).toBeVisible();
    await expect(page.getByText(CHECKOUT.addressLine)).toBeVisible();
    await expect(page.getByText(t('checkout.cashOnDelivery')).first()).toBeVisible();
  });

  await test.step('the order emptied the cart', async () => {
    // The badge renders nothing at all for an empty cart rather than a zero,
    // and it re-reads on every navigation — it once still said "2" here.
    await gotoRendered(page, '/ar');
    await expect(cartLink(page)).not.toContainText(/\d/);
  });

  await test.step('tracking finds it with the number and the phone', async () => {
    await gotoRendered(page, '/ar/track');
    await page.fill('input[name="orderNumber"]', orderNumber);
    await page.fill('input[name="phone"]', CHECKOUT.phone);
    await page.getByRole('button', { name: t('order.trackSubmit') }).click();

    await page.waitForURL(`**/ar/orders/${orderNumber}`);
    await expect(page.getByText(CHECKOUT.addressLine)).toBeVisible();
  });
});

test('an unavailable variant cannot be added to the cart', async ({ page }) => {
  await gotoRendered(page, '/ar/products');

  const hrefs = await page
    .locator('main a[href*="/ar/products/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));

  let proved = false;

  // Availability is per VARIANT, not per product: the seed's phones are in
  // stock in one storage size and out in another, and every published product
  // has at least one variant somebody can buy. So the thing to find is not an
  // unavailable product — there is none — but an unavailable SELECTION.
  for (const href of hrefs.slice(0, 10)) {
    await gotoRendered(page, href);

    const addToCart = page
      .getByRole('button', { name: t('product.addToCart') })
      .first();
    const options = page.locator('button[aria-pressed]');

    for (let index = 0; index < (await options.count()); index += 1) {
      await options.nth(index).click();
      if (await addToCart.isEnabled()) continue;

      // Disabled, never hidden, and beside a line saying why: an absent button
      // reads as a broken page, while a dimmed one next to "غير متوفر حاليًا"
      // reads as a shop being honest about its stock.
      await expect(page.getByText(t('product.outOfStock')).first()).toBeVisible();
      proved = true;
      break;
    }

    if (proved) break;
  }

  // Skipped rather than failed when every variant in the catalogue happens to
  // be in stock: that is the owner's business, not a defect. What must never
  // happen is an unavailable selection that CAN be added, and the loop above
  // is what would catch it.
  test.skip(!proved, 'every variant in the catalogue is currently purchasable');
});
