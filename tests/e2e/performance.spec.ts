import { expect, test, type Page, type Response } from '@playwright/test';
import { gotoRendered } from './fixtures';

/**
 * A budget for the JavaScript a customer downloads.
 *
 * This exists because of a specific, measured regression that nothing else
 * would have caught. Three client components imported two pure URL helpers
 * from `schemas/catalogue.ts` — a module whose first line is `import { z } from
 * 'zod'` — and that pulled the whole Zod runtime into the browser. The
 * catalogue shipped **1048 kB** of script so a filter checkbox could edit a
 * query string. Moving the helpers to `lib/domain/catalogue-url.ts` took it to
 * 670 kB. The same mistake in `schemas/auth.ts` cost the sign-in page 432 kB.
 *
 * Nothing about that is visible in review: the import looks tidy, the types
 * are right, and the page works. It is visible here.
 *
 * To re-measure after a deliberate change, run the suite and read the failure
 * — it prints the actual number — then move the budget with a note saying what
 * was added and why it was worth it.
 */

/** Measured at 670 kB; the headroom is for a component or two, not a library. */
const CATALOGUE_BUDGET_KB = 800;

/** Measured at 644 kB. The homepage is the one every customer lands on. */
const HOME_BUDGET_KB = 750;

async function scriptWeight(
  page: Page,
  path: string,
): Promise<{ kB: number; zod: boolean }> {
  let bytes = 0;
  let zod = false;

  const collect = async (response: Response) => {
    if (response.request().resourceType() !== 'script') return;
    try {
      const body = await response.body();
      bytes += body.length;
      // `$ZodType` is Zod's own internal marker — cheaper and more reliable
      // than guessing a filename, and it survives minification.
      if (body.toString('utf8').includes('$ZodType')) zod = true;
    } catch {
      // A response whose body is gone by the time we ask is one we cannot
      // count; failing the whole run over it would make this test flaky.
    }
  };

  page.on('response', collect);
  await gotoRendered(page, path);
  await page.waitForLoadState('networkidle');
  page.off('response', collect);

  return { kB: Math.round(bytes / 1024), zod };
}

test('the storefront stays inside its JavaScript budget', async ({ page }) => {
  const home = await scriptWeight(page, '/ar');
  expect(
    home.kB,
    `the homepage now ships ${home.kB} kB of script (budget ${HOME_BUDGET_KB} kB)`,
  ).toBeLessThanOrEqual(HOME_BUDGET_KB);

  const catalogue = await scriptWeight(page, '/ar/products');
  expect(
    catalogue.kB,
    `the catalogue now ships ${catalogue.kB} kB of script (budget ${CATALOGUE_BUDGET_KB} kB)`,
  ).toBeLessThanOrEqual(CATALOGUE_BUDGET_KB);
});

test('no page a customer opens ships a validation library', async ({ page }) => {
  /*
    The sharper half of the same rule. Zod belongs on the server, where the
    values come from the address bar and therefore from anyone; in the browser
    it was validating four small forms and editing a query string. A byte
    budget catches this eventually — naming it catches it in the diff that
    introduces it, and says what to do instead.
  */
  for (const path of [
    '/ar',
    '/ar/products',
    '/ar/sign-in',
    '/ar/sign-up',
    '/ar/cart',
  ]) {
    const { zod, kB } = await scriptWeight(page, path);
    expect(
      zod,
      `${path} is shipping Zod to the browser (${kB} kB of script). Move the ` +
        `pure part to lib/ and leave the schema on the server — see ` +
        `lib/domain/catalogue-url.ts and lib/domain/auth-form.ts.`,
    ).toBe(false);
  }
});
