import { expect, test } from '@playwright/test';
import {
  addSelectedVariantToCart,
  fillCheckout,
  gotoRendered,
  openPurchasableProduct,
  readPrices,
  t,
} from './fixtures';
import {
  DEMO_COUPON_CODE,
  DEMO_COUPON_MAX_DISCOUNT_IQD,
  DEMO_COUPON_MIN_ORDER_IQD,
} from '../../server/db/seed-data/coupon';

/**
 * A discount code, applied by a customer in a browser.
 *
 * The rules are unit-tested and the claim is integration-tested; neither can
 * say what this one says, which is that **what the customer was quoted is what
 * they were charged**. Those are two different numbers computed at two
 * different times — one by `quoteCouponAction` while the form is open, one
 * inside the transaction that writes the order — and the only place they can be
 * compared is a page that shows both.
 *
 * The code comes from the seed rather than from a literal here, for the reason
 * the Arabic copy does: a code typed into a test is a second source of truth
 * that passes against a database that no longer has the row (§13.16).
 */

/** The four figures in the checkout summary, or a failure naming what was there. */
function summaryFigures(prices: number[]): {
  subtotal: number;
  discount: number;
  delivery: number;
  total: number;
} {
  const [subtotal, discount, delivery, total] = prices;

  if (
    subtotal === undefined ||
    discount === undefined ||
    delivery === undefined ||
    total === undefined
  ) {
    throw new Error(
      `expected subtotal, discount, delivery and total in the summary — found ` +
        `${prices.length}: ${prices.join(', ')}`,
    );
  }

  return { subtotal, discount, delivery, total };
}

test('a discount code is priced by the server and charged as quoted', async ({
  page,
}) => {
  await openPurchasableProduct(page);
  await addSelectedVariantToCart(page);
  await gotoRendered(page, '/ar/cart');

  const summary = page.getByText(t('cart.subtotal')).locator('..');

  /*
    The demo code has a minimum order, which is the point of having one — so the
    cart has to clear it before the code can apply at all. Raising the quantity
    is how a customer would do it, and it keeps this test independent of what
    the catalogue happens to cost today (§13.13).
  */
  await test.step('raise the cart above the code’s minimum', async () => {
    const subtotal = async () => (await readPrices(summary))[0] ?? 0;

    for (let click = 0; click < 20 && (await subtotal()) < DEMO_COUPON_MIN_ORDER_IQD;) {
      const before = await subtotal();
      await page
        .getByRole('button', { name: t('cart.increase') })
        .first()
        .click();
      await expect.poll(subtotal).not.toBe(before);
      click += 1;
    }

    expect(
      await subtotal(),
      'one line at the quantity cap could not reach the demo coupon minimum',
    ).toBeGreaterThanOrEqual(DEMO_COUPON_MIN_ORDER_IQD);
  });

  await page
    .getByRole('link', { name: t('cart.checkout') })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: t('checkout.title') })).toBeVisible();

  // Before the coupon, so the delivery fee is already quoted and the summary
  // holds every figure the arithmetic below needs.
  await fillCheckout(page);

  const aside = page.locator('aside').first();
  const couponBox = page.locator('#coupon');
  const apply = page.getByRole('button', { name: t('checkout.couponApply') });

  await test.step('a code that does not exist says nothing about which codes do', async () => {
    await couponBox.fill(`${DEMO_COUPON_CODE}-NOPE`);
    await apply.click();

    /*
      The generic refusal, deliberately: "no such code", "switched off" and
      "out of season" answer identically, because distinguishing them turns
      this box into a way to enumerate the shop's campaigns (§12). Asserting
      the exact message is how a future "helpful" rewording gets caught.
    */
    await expect(page.getByText(t('checkout.couponInvalid'))).toBeVisible();
    expect(await readPrices(aside)).toHaveLength(3);
  });

  const quoted = await test.step('the real code discounts the total', async () => {
    await couponBox.fill(DEMO_COUPON_CODE.toLowerCase());
    await apply.click();
    await expect(aside.getByText(t('cart.discount'))).toBeVisible();

    const figures = summaryFigures(await readPrices(aside));

    expect(figures.discount, 'the code applied but took nothing off').toBeGreaterThan(
      0,
    );
    expect(
      figures.discount,
      "the owner's cap on the percentage was not honoured",
    ).toBeLessThanOrEqual(DEMO_COUPON_MAX_DISCOUNT_IQD);

    // The arithmetic a customer would do in their head, and the one
    // `orderTotals` enforces as a CHECK constraint on the row.
    expect(figures.total).toBe(figures.subtotal - figures.discount + figures.delivery);

    return figures;
  });

  await test.step('removing it puts the price back', async () => {
    await page.getByRole('button', { name: t('checkout.couponRemove') }).click();
    await expect(aside.getByText(t('cart.discount'))).toHaveCount(0);

    const prices = await readPrices(aside);
    expect(prices[prices.length - 1]).toBe(quoted.subtotal + quoted.delivery);
  });

  await test.step('and the order is charged what the code quoted', async () => {
    await couponBox.fill(DEMO_COUPON_CODE);
    await apply.click();
    await expect(aside.getByText(t('cart.discount'))).toBeVisible();

    await page.getByRole('button', { name: t('checkout.submit') }).click();
    await page.waitForURL(/\/ar\/orders\/MPS-/);

    await expect(
      page.getByRole('heading', { name: t('order.confirmedTitle') }),
    ).toBeVisible();

    /*
      Read off the CONFIRMATION, which renders the order row — so these numbers
      came out of Postgres, not out of the form that was just submitted. A
      quote the server then ignored would show up here and nowhere else.
    */
    const charged = summaryFigures(await readPrices(page.locator('aside').first()));

    expect(charged.subtotal).toBe(quoted.subtotal);
    expect(charged.discount).toBe(quoted.discount);
    expect(charged.delivery).toBe(quoted.delivery);
    expect(charged.total).toBe(quoted.total);
  });
});
