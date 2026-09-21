import { expect, test, type Page } from '@playwright/test';
import {
  addSelectedVariantToCart,
  gotoRendered,
  openPurchasableProduct,
  submitCheckout,
} from './fixtures';

/**
 * The four events, and the one that must never be reported twice.
 *
 * MPS connects to no analytics provider (`lib/domain/analytics.ts` says why),
 * so what is asserted here is the queue itself: `window.dataLayer`, the array
 * every tag manager reads. If the owner ever pastes a snippet in, these are
 * the events it will find — and this is the only way to know they are there,
 * because nothing on screen changes when they are not.
 *
 * The claim that matters is the last one. A confirmation page is a real URL a
 * customer reloads, bookmarks and comes back to; reporting a second sale for
 * that puts a number in the owner's reports that no money matches.
 */

type Recorded = { event: string; value: number; transaction_id?: string };

const recorded = (page: Page) =>
  page.evaluate(
    () =>
      ((window as typeof window & { dataLayer?: Recorded[] }).dataLayer ??
        []) as Recorded[],
  );

test('the funnel is reported, and a sale only once', async ({ page }) => {
  await openPurchasableProduct(page);

  await test.step('arriving at a product reports view_item', async () => {
    const events = await recorded(page);
    expect(events.map((entry) => entry.event)).toContain('view_item');
    // The price the visitor is looking at, not zero.
    const viewed = events.find((entry) => entry.event === 'view_item');
    expect(viewed?.value).toBeGreaterThan(0);
  });

  await test.step('adding reports add_to_cart', async () => {
    await addSelectedVariantToCart(page);
    await expect
      .poll(async () => (await recorded(page)).map((entry) => entry.event))
      .toContain('add_to_cart');
  });

  await gotoRendered(page, '/ar/checkout');

  await test.step('reaching checkout reports begin_checkout once', async () => {
    const events = await recorded(page);
    const begun = events.filter((entry) => entry.event === 'begin_checkout');
    expect(begun).toHaveLength(1);
    expect(begun[0]?.value).toBeGreaterThan(0);
  });

  const orderNumber = await submitCheckout(page);

  await test.step('the sale is reported with the order number', async () => {
    await expect
      .poll(async () => (await recorded(page)).map((entry) => entry.event))
      .toContain('purchase');

    const purchase = (await recorded(page)).find((entry) => entry.event === 'purchase');
    expect(purchase?.transaction_id).toBe(orderNumber);
    expect(purchase?.value).toBeGreaterThan(0);
  });

  await test.step('reloading the confirmation does not sell it again', async () => {
    // The query is still in the address bar, which is the ordinary case — the
    // customer presses refresh, or comes back to the tab and it reloads.
    await page.reload();
    await page.waitForLoadState('networkidle');

    const purchases = (await recorded(page)).filter(
      (entry) => entry.event === 'purchase',
    );
    expect(
      purchases,
      'a reload of the confirmation page reported a second sale',
    ).toHaveLength(0);
  });
});
