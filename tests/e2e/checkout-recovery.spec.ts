import { expect, test } from '@playwright/test';
import {
  CHECKOUT,
  addSelectedVariantToCart,
  gotoRendered,
  openPurchasableProduct,
  t,
  tPrefix,
} from './fixtures';

/**
 * A rejected checkout keeps what the customer typed.
 *
 * React resets an uncontrolled form once its action returns, so a single
 * mistyped digit in the phone emptied all six fields — name, governorate,
 * city, the street, the notes — and the customer started the whole form
 * again. Nothing on the server was wrong, which is why no unit or integration
 * test could see it: the loss happens in the browser, after a correct refusal.
 *
 * This is the one claim in the suite that is about a FAILED submission, and it
 * is the most expensive failure on the site — the customer has already chosen
 * what to buy.
 */
test('a rejected checkout does not empty the form', async ({ page }) => {
  await openPurchasableProduct(page);
  await addSelectedVariantToCart(page);
  await gotoRendered(page, '/ar/checkout');

  await page.fill('input[name="fullName"]', CHECKOUT.fullName);
  // Seven digits: an Iraqi mobile is ten, so the normaliser refuses it. The
  // refusal is the point — everything else on the form is valid.
  await page.fill('input[name="phone"]', '0770123');
  await page.selectOption('select[name="governorate"]', 'BAGHDAD');
  await page.fill('input[name="city"]', CHECKOUT.city);
  await page.fill('textarea[name="addressLine"]', CHECKOUT.addressLine);

  // The fee has to be quoted before the button is enabled at all.
  await expect(page.getByText(tPrefix('checkout.deliveryEta')).first()).toBeVisible();

  await page.getByRole('button', { name: t('checkout.submit') }).click();

  // The refusal arrives, named on the field that caused it.
  await expect(page.getByText(t('validation.invalidPhone'))).toBeVisible();

  // And everything else is still there. Read from the DOM's live values, not
  // the attributes: an input whose `defaultValue` is right while its `value`
  // was reset looks correct in the markup and empty to the customer.
  await expect(page.locator('input[name="fullName"]')).toHaveValue(CHECKOUT.fullName);
  await expect(page.locator('input[name="city"]')).toHaveValue(CHECKOUT.city);
  await expect(page.locator('textarea[name="addressLine"]')).toHaveValue(
    CHECKOUT.addressLine,
  );
  await expect(page.locator('select[name="governorate"]')).toHaveValue('BAGHDAD');
  // The phone keeps what was typed, not a corrected version of it: the
  // customer has to see their own mistake to fix it.
  await expect(page.locator('input[name="phone"]')).toHaveValue('0770123');
});
