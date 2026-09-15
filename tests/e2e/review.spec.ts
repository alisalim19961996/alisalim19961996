import { expect, test } from '@playwright/test';
import {
  adminCredentials,
  customerCredentials,
  gotoRendered,
  openPurchasableProduct,
  signIn,
  t,
} from './fixtures';

/**
 * Reviews, in a browser.
 *
 * The claim that needs one is the same shape as the wishlist heart's: the
 * product page is PRERENDERED, so it cannot know who is looking. Everything
 * about reviews that is the same for everyone — the average, the breakdown,
 * the approved list — renders server-side; only the box where a form might go
 * asks after hydration (§8). A component that decides what it is a moment
 * after appearing can only be tested here.
 *
 * Whether a review may be WRITTEN is decided by a delivered order, which is
 * three joins deep and covered against a real database in
 * `tests/integration/reviews.test.ts`. Driving a customer through checkout and
 * then six order statuses to reach the same assertion would mostly re-test the
 * order lifecycle.
 */

test('the review section renders for everyone, and the form does not', async ({
  page,
}) => {
  await openPurchasableProduct(page);

  // Server-rendered, so it is in the HTML of a page built at deploy time.
  await expect(page.getByRole('heading', { name: t('review.heading') })).toBeVisible();

  // Signed out: an invitation to sign in, not a form that would fail on
  // submit and not an empty gap where a control should be.
  await expect(
    page.getByRole('link', { name: t('review.signInToReview') }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: t('review.submit') })).toHaveCount(0);
});

test('a customer who has not received the product is told why, not shown a form', async ({
  page,
}) => {
  await signIn(page, customerCredentials(), 'account');
  await expect(page.getByRole('heading', { name: t('account.title') })).toBeVisible();

  await openPurchasableProduct(page);
  await expect(page.getByRole('heading', { name: t('review.heading') })).toBeVisible();

  /*
    The honest refusal, and the reason it is worth asserting on: "reviews are
    for customers who received this product" is a claim the shop makes about
    every review on the page. A form here for anybody with an account would
    make that claim false.
  */
  await expect(page.getByText(t('review.notPurchased'))).toBeVisible();
  await expect(page.getByRole('button', { name: t('review.submit') })).toHaveCount(0);
});

test('the moderation queue is staff-only and opens on what is waiting', async ({
  page,
  browser,
}) => {
  const visitor = await browser.newContext();
  try {
    const strangerPage = await visitor.newPage();
    await strangerPage.goto('/ar/admin/reviews');
    // Customers' own words about their purchases, with their names attached.
    await expect(strangerPage).toHaveURL(/\/ar\/sign-in/);
  } finally {
    await visitor.close();
  }

  await signIn(page, adminCredentials(), 'admin');
  await page.waitForURL(/\/ar\/admin\b/);

  await gotoRendered(page, '/ar/admin/reviews');
  await expect(page.getByRole('heading', { name: t('admin.reviews') })).toBeVisible();

  // It opens on the queue rather than on everything: the tab that is active
  // with no `?status=` is the one holding the work.
  const waiting = page.getByRole('link', {
    name: new RegExp(t('admin.reviewsPending')),
  });
  await expect(waiting).toBeVisible();
});
