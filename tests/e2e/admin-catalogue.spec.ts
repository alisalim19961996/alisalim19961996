import { expect, test } from '@playwright/test';
import { adminCredentials, gotoRendered, signIn, t } from './fixtures';

/**
 * The dashboard, driven the way the owner drives it.
 *
 * Two claims here are load-bearing and neither can be proved below the browser.
 * The first is that unpublishing actually removes a product from the shop —
 * the service is integration-tested, but "the customer stops seeing it" is a
 * different sentence. The second is that the specification fields are
 * generated from the chosen product type (§12), which is what makes selling a
 * new category data entry rather than a release; a test that reads the form
 * is the only one that can see the fields change.
 */

test.beforeEach(async ({ page }) => {
  await signIn(page, adminCredentials(), 'admin');
  // `?next=admin` is honoured only for someone who can actually open the
  // dashboard — conflating "not signed in" with "not staff" produced a
  // redirect loop once (§8).
  await page.waitForURL(/\/ar\/admin\b/);
});

test('unpublishing takes the product off the shop floor, and publishing puts it back', async ({
  page,
}) => {
  await gotoRendered(page, '/ar/admin/products?status=published');

  const row = page.locator('tbody tr').first();
  const name = (await row.locator('a').first().innerText()).trim();
  expect(name, 'the dashboard listed no published product to work with').not.toBe('');

  // The storefront's own search is how a customer would look for it, and it
  // pages — so searching is more honest than hunting through the grid.
  const storefrontHits = async (): Promise<number> => {
    await gotoRendered(page, `/ar/products?q=${encodeURIComponent(name)}`);
    return page
      .locator('main a[href*="/ar/products/"]')
      .filter({ hasText: name })
      .count();
  };

  expect(
    await storefrontHits(),
    'the product was not on the shop floor to begin with',
  ).toBeGreaterThan(0);

  /*
    Scoped to the row, not the page — and that is not fussiness. The status
    tabs above the table are also labelled "منشور" and "مسودة", so
    `getByText(draft).first()` matched the TAB and passed the instant the page
    loaded, before the row had flipped. The storefront was then read too early
    and the test failed about one run in ten, blaming the shop.
  */
  const statusCell = (title: string) =>
    page.locator('tbody tr').filter({ hasText: title }).first().locator('td').last();

  try {
    await gotoRendered(page, `/ar/admin/products?q=${encodeURIComponent(name)}`);
    await page
      .getByRole('button', { name: t('admin.unpublish') })
      .first()
      .click();
    await expect(statusCell(name)).toContainText(t('admin.draft'));

    // Polled: the assertion is "it stops being sold", and reading the
    // storefront once is a race with however long the server takes to say so.
    await expect
      .poll(storefrontHits, { message: 'a draft product is still being sold' })
      .toBe(0);
  } finally {
    /*
      Restored here rather than in an afterAll, and that distinction is not
      pedantry: the users integration suite parked every ADMIN as a CUSTOMER
      and restored them at the end, a run was interrupted, and the dev database
      was left with no reachable admin at all (§17). A `finally` narrows the
      window to this test even when an assertion above throws.
    */
    await gotoRendered(page, `/ar/admin/products?q=${encodeURIComponent(name)}`);
    await page
      .getByRole('button', { name: t('admin.publish'), exact: true })
      .first()
      .click();
    await expect(statusCell(name)).toContainText(t('admin.published'));
  }

  await expect
    .poll(storefrontHits, { message: 'republishing did not put the product back' })
    .toBeGreaterThan(0);
});

test('the specification fields come from the product type, not from the code', async ({
  page,
}) => {
  await gotoRendered(page, '/ar/admin/products/new');

  const typeSelect = page.locator('select[name="productTypeId"]');
  const typeValues = await typeSelect
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
    );

  expect(
    typeValues.length,
    'the seed should offer more than one product type',
  ).toBeGreaterThan(1);

  /*
    Every generated input is named `attr-<key>`, where the key is an
    AttributeDefinition row. Reading the names rather than counting boxes is
    what makes this a test of the mechanism: a phone asks for 19 of them and an
    accessory for 6, and this file knows neither number — it only knows the two
    sets must differ, which is false the moment the fields are hard-coded.
  */
  const specKeys = async (): Promise<string[]> =>
    (
      await page
        .locator('[name^="attr-"]')
        .evaluateAll((fields) =>
          fields.map((field) => field.getAttribute('name') ?? ''),
        )
    ).sort();

  await typeSelect.selectOption(typeValues[0]!);
  const first = await specKeys();

  await typeSelect.selectOption(typeValues[1]!);
  await expect.poll(specKeys).not.toEqual(first);

  const second = await specKeys();
  expect(
    first.length,
    'the first product type asked for no specifications',
  ).toBeGreaterThan(0);
  expect(
    second.length,
    'the second product type asked for no specifications',
  ).toBeGreaterThan(0);
});

test('a signed-out visitor is sent to sign in, not shown the dashboard', async ({
  browser,
}) => {
  const visitor = await browser.newContext();

  try {
    const page = await visitor.newPage();
    await page.goto('/ar/admin');

    // The route protection is the first door; every admin service re-checks
    // behind it, because a Server Action can be invoked without ever loading
    // the page (§7).
    await expect(page).toHaveURL(/\/ar\/sign-in\?next=admin/);
    await expect(page.locator('input[name="password"]')).toBeVisible();

    // A second door, because the first one only proves a redirect: this page
    // is ADMIN-only and lists every customer's email and phone.
    await page.goto('/ar/admin/users');
    await expect(page).toHaveURL(/\/ar\/sign-in/);
  } finally {
    await visitor.close();
  }
});
