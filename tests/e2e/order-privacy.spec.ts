import { expect, test, type Page } from '@playwright/test';
import {
  CHECKOUT,
  addSelectedVariantToCart,
  customerCredentials,
  gotoRendered,
  openPurchasableProduct,
  signIn,
  submitCheckout,
  t,
} from './fixtures';

/**
 * An order number is not a credential.
 *
 * `MPS-<YY><DDD>-<NNNN>` is sequential on purpose — it has to be readable
 * aloud to a courier — which means anybody who has one of their own can guess
 * the next. What actually grants access is the httpOnly `mps.order_grant`
 * cookie written at checkout — 256 random bits, stored only as a hash — or a
 * session that owns the order, or the phone number through the tracking form
 * (§12).
 *
 * The integration suite proves the queries return nothing. This proves the
 * SCREEN shows nothing, which is a different claim: a leak here would be a
 * name, a phone number and a home address rendered by a page whose query was
 * perfectly correct.
 */

async function placeAnOrder(page: Page): Promise<string> {
  await openPurchasableProduct(page);
  await addSelectedVariantToCart(page);
  await gotoRendered(page, '/ar/checkout');
  return submitCheckout(page);
}

test('another browser cannot open the order', async ({ page, browser }) => {
  const orderNumber = await placeAnOrder(page);

  // The buyer reads their own order — the control for everything below. If
  // this ever fails, the assertions after it would pass for the wrong reason.
  await gotoRendered(page, `/ar/orders/${orderNumber}`);
  await expect(page.getByText(CHECKOUT.addressLine)).toBeVisible();

  const stranger = await browser.newContext();

  try {
    const strangerPage = await stranger.newPage();
    await strangerPage.goto(`/ar/orders/${orderNumber}`);

    // Asserting on the rendered body rather than on a locator: the question is
    // not "is the address in a box somewhere" but "is any of it on the page at
    // all", and a locator that finds nothing cannot tell the two apart.
    const body = (await strangerPage.locator('body').innerText()).replace(/\s+/g, ' ');

    expect(body, 'a stranger was shown the delivery address').not.toContain(
      CHECKOUT.addressLine,
    );
    expect(body, 'a stranger was shown the customer name').not.toContain(
      CHECKOUT.fullName,
    );
    expect(body, 'a stranger was shown the phone number').not.toContain('7712345');

    // The page is not a 404 either: it says the order could not be found and
    // offers the tracking form, which is the one legitimate way in.
    expect(body).toContain(t('order.notFound'));
  } finally {
    await stranger.close();
  }
});

test('tracking answers the same for a wrong phone and a number that never existed', async ({
  page,
}) => {
  const orderNumber = await placeAnOrder(page);

  const attempt = async (number: string, phone: string): Promise<string> => {
    await gotoRendered(page, '/ar/track');
    await page.fill('input[name="orderNumber"]', number);
    await page.fill('input[name="phone"]', phone);
    await page.getByRole('button', { name: t('order.trackSubmit') }).click();

    const alert = page.getByRole('alert').filter({ hasText: /\S/ }).first();
    await expect(alert).toBeVisible();
    return (await alert.innerText()).trim();
  };

  // A real order, the wrong phone.
  const wrongPhone = await attempt(orderNumber, CHECKOUT.wrongPhone);

  // A number the store has never issued: day 999 cannot occur.
  const noSuchOrder = await attempt('MPS-99999-9999', CHECKOUT.phone);

  // Identical, deliberately. Two different answers would turn this form into a
  // way to sweep the number space and learn which orders are real — and the
  // numbers are sequential, so that is one loop.
  expect(wrongPhone).toBe(noSuchOrder);
  expect(wrongPhone).toBe(t('order.notFound'));
});

test('signing out takes the order with it', async ({ page }) => {
  await signIn(page, customerCredentials(), 'account');
  await expect(page.getByRole('heading', { name: t('account.title') })).toBeVisible();

  const orderNumber = await placeAnOrder(page);

  await gotoRendered(page, `/ar/orders/${orderNumber}`);
  await expect(page.getByText(CHECKOUT.addressLine)).toBeVisible();

  await gotoRendered(page, '/ar/account');
  await page
    .getByRole('button', { name: t('account.signOut') })
    .first()
    .click();
  // Signing out replaces the history entry with the homepage, so the URL is
  // the signal that better-auth answered — not a button somewhere on the page.
  await expect(page).toHaveURL(/\/ar\/?$/);

  /*
    Two things have to be gone, and only one of them is the session.
    `mps.order_grant` means "this BROWSER ordered it", not "this account did",
    and it used to outlive the session: on a shared computer the next person
    could open the previous customer's order and read their name, phone and
    address (§7). The owner loses nothing, because the order is in their
    account — which is why this checks after signing out rather than instead.
  */
  await page.goto(`/ar/orders/${orderNumber}`);
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  expect(body, 'the address survived a sign-out').not.toContain(CHECKOUT.addressLine);
});

test('a hand-written cookie does not open an order', async ({ page, browser }) => {
  const orderNumber = await placeAnOrder(page);

  /*
    The cookie used to hold the order NUMBER, and the check was that it equalled
    the number in the URL. `httpOnly` stops JavaScript reading a cookie; it does
    nothing about a client SETTING one, which is what this test does — and with
    sequential numbers that was a customer's name, phone and address for anyone
    willing to type four digits.

    A second context, so nothing of the buyer's own session is in play. Both
    the current cookie name and the one it replaced are tried, because a
    browser that still holds the old one must also get nothing.
  */
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: 'mps.order_grant',
      value: orderNumber,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    },
    {
      name: 'mps.recent_order',
      value: orderNumber,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    },
  ]);

  const stranger = await context.newPage();
  await stranger.goto(`/ar/orders/${orderNumber}`);
  const body = (await stranger.locator('body').innerText()).replace(/\s+/g, ' ');

  expect(body, 'a forged cookie opened the order').not.toContain(CHECKOUT.addressLine);
  expect(body, 'a forged cookie opened the order').not.toContain(CHECKOUT.fullName);
  await expect(stranger.getByText(t('order.notFound'))).toBeVisible();

  await context.close();
});
