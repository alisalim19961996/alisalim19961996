import { expect, test, type Page } from '@playwright/test';
import {
  customerCredentials,
  gotoRendered,
  openPurchasableProduct,
  signIn,
  t,
} from './fixtures';

/**
 * The wishlist, in a browser.
 *
 * The heart is the one control in this store that does not know its own state
 * when it renders: the homepage and all 32 product pages are prerendered, so
 * reading the session during render would turn every one of them into a
 * per-request render (§8). It therefore loads what the customer has saved
 * AFTER hydration, exactly as the cart badge does — and a control that decides
 * what it is a moment after appearing can only be tested in a real browser.
 *
 * The other claim here is the signed-out one. A wishlist belongs to an account
 * because the schema says so, and the failure worth catching is not an error
 * message: it is a heart that looks pressable and quietly does nothing.
 */

const heart = (page: Page, label: 'save' | 'remove') =>
  page.getByRole('button', { name: t(`wishlist.${label}`) }).first();

test('a signed-out visitor is offered sign-in, not a heart that does nothing', async ({
  page,
}) => {
  await openPurchasableProduct(page);

  // A link, not a button: pressing it has to go somewhere, because there is no
  // anonymous list for it to write to.
  await expect(
    page.getByRole('link', { name: t('wishlist.signInToSave') }).first(),
  ).toBeVisible();

  await page.goto('/ar/wishlist');
  // Sent to sign in rather than shown an empty list, which would read as "you
  // have saved nothing" to somebody who has saved plenty.
  await expect(page).toHaveURL(/\/ar\/sign-in/);
});

test('saving a product puts it on the wishlist, and unsaving takes it off', async ({
  page,
}) => {
  await signIn(page, customerCredentials(), 'account');
  await expect(page.getByRole('heading', { name: t('account.title') })).toBeVisible();

  await openPurchasableProduct(page);
  const name = (await page.locator('main h1').first().innerText()).trim();

  /*
    Normalised rather than assumed. The demo customer's list survives between
    runs, so a previous run that failed halfway would leave this product
    already saved — and the first click would then unsave it, making the rest
    of this test assert the opposite of what it reads like.
  */
  await expect(heart(page, 'save').or(heart(page, 'remove'))).toBeVisible();
  if (await heart(page, 'remove').isVisible()) {
    await heart(page, 'remove').click();
    await expect(heart(page, 'save')).toBeVisible();
  }

  await test.step('the heart saves it', async () => {
    await heart(page, 'save').click();

    /*
      Two assertions, and the second is the one that matters.

      The heart flips before the server has answered — optimistically, because
      a heart that waits for a round trip to fill in reads as a broken button.
      So "it says remove" is satisfied instantly and proves nothing about the
      database. Navigating on that alone is what made the first version of this
      test fail: the browser cancelled the in-flight action on the way to the
      next page, and the wishlist was empty.

      React commits the optimistic flip and the transition's `disabled` in the
      same render, so the button is already disabled by the time it reads
      "remove" — which makes "enabled again" a real signal that the action
      resolved, rather than a timeout dressed up as one.
    */
    await expect(heart(page, 'remove')).toBeVisible();
    await expect(heart(page, 'remove')).toBeEnabled();
  });

  const savedCard = () =>
    page
      .locator('main li')
      .filter({ hasText: name })
      .filter({ has: page.locator('h3') });

  await test.step('and the wishlist page shows it', async () => {
    await gotoRendered(page, '/ar/wishlist');
    await expect(savedCard().first()).toBeVisible();
  });

  await test.step('unsaving from the list removes the card, not just the icon', async () => {
    /*
      The card is server-rendered while the heart updates itself, so without
      the page re-reading itself an unsaved product sits there with an empty
      heart until a reload — which reads as the button not having worked.
    */
    await savedCard().first().getByRole('button').first().click();
    await expect.poll(() => savedCard().count()).toBe(0);

    // And it is gone from the server too, not only from this render.
    await gotoRendered(page, '/ar/wishlist');
    await expect(savedCard()).toHaveCount(0);
  });
});
