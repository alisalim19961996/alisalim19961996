import { expect, type Locator, type Page } from '@playwright/test';
import arabic from '../../messages/ar.json';

/**
 * Shared ground for the end-to-end specs.
 *
 * The rule worth stating up front: **no Arabic copy is written in a test.**
 * Every label comes from `messages/ar.json` through `t()`, which is the same
 * file the page renders from. Hard-coding "أضف إلى السلة" would make this
 * suite a second copy of the owner's copy: it would break the day they reword
 * a button, which is not a defect, and it would keep passing if the page ever
 * rendered a raw key like `cart.checkout`, which is.
 */

/*
  Imported rather than read from disk: Playwright transpiles a spec to CommonJS,
  where `import.meta.url` does not exist, and a path built from `process.cwd()`
  would depend on the directory the suite was started from.
*/
const messages: unknown = arabic;

/**
 * One label, by its dotted key, or a loud failure.
 *
 * A missing key returns `undefined` from a naive lookup, and a locator built
 * on `undefined` quietly matches everything — the test then passes while
 * asserting nothing. Throwing is the difference between a renamed key being
 * reported and being absorbed.
 */
export function t(path: string): string {
  let node: unknown = messages;

  for (const key of path.split('.')) {
    if (typeof node !== 'object' || node === null || !(key in node)) {
      throw new Error(
        `messages/ar.json has no key "${path}" — either it was renamed, ` +
          `or this test is looking for the wrong one.`,
      );
    }
    node = (node as Record<string, unknown>)[key];
  }

  if (typeof node !== 'string') {
    throw new Error(`messages/ar.json key "${path}" is not a string`);
  }

  return node;
}

/**
 * The fixed half of an ICU message, for matching text that carries a number.
 *
 * `checkout.deliveryEta` is "التوصيل خلال {min}-{max} يوم"; the days come from
 * `DeliveryRate` and are the owner's to change, so the test matches the words
 * around them rather than asserting a fee it has no business knowing (§13.13).
 */
export function tPrefix(path: string): string {
  const prefix = t(path).split('{')[0]?.trim();
  if (!prefix)
    throw new Error(`messages/ar.json key "${path}" starts with a placeholder`);
  return prefix;
}

/**
 * Staff credentials for the admin spec.
 *
 * Defaulted to the account the seed creates, with the password read from the
 * same variable the seed reads, so anyone who has run `pnpm db:seed` needs no
 * extra configuration. The failure names the command rather than the variable,
 * because knowing the password here is only half of it — it has to be hashed
 * into the database as well.
 */
export function adminCredentials(): { email: string; password: string } {
  const email = process.env.E2E_ADMIN_EMAIL ?? 'admin@mps.local';
  const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.DEMO_ADMIN_PASSWORD;

  if (!password) {
    throw new Error(
      'The admin e2e spec needs a staff password it can sign in with.\n' +
        'Set DEMO_ADMIN_PASSWORD in .env and run `pnpm db:seed`, so the same\n' +
        'password is hashed into the database, then run the suite again.',
    );
  }

  return { email, password };
}

/**
 * The demo customer, for the one behaviour that needs a real session.
 *
 * The seed hashes the same password onto both demo accounts, so this asks for
 * nothing the admin spec does not already require.
 */
export function customerCredentials(): { email: string; password: string } {
  return {
    ...adminCredentials(),
    email: process.env.E2E_CUSTOMER_EMAIL ?? 'customer@mps.local',
  };
}

/**
 * A delivery address a courier could actually act on. Prefix 77 is a real
 * Iraqi range, and the last seven digits are drawn fresh for every run.
 *
 * Random because order tracking is rate limited per phone number
 * (`server/rate-limit.ts`): five attempts a quarter hour is generous for a
 * customer and ample for one pass of this suite, but a fixed number would
 * accumulate across runs and the third run of the afternoon would fail on the
 * limiter rather than on the code.
 */
const runPhone = `077${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

export const CHECKOUT = {
  fullName: 'زبون اختبار آلي',
  phone: runPhone,
  city: 'الكرادة',
  addressLine: 'شارع الاختبار، قرب الجسر، بيت ٣',
  /** Never used on an order — the tracking form is asked for it on purpose. */
  wrongPhone: '07700000000',
} as const;

/**
 * Navigate, and wait for the PAGE to be rendered rather than merely loaded.
 *
 * Next streams inside Suspense, so `load` can fire on a document whose body is
 * still empty — CLAUDE.md §17 lists that as the first of the measurement traps
 * that produced a false bug report here. The obvious fix, "wait for a
 * heading", is the same trap wearing a hat: the layout renders OUTSIDE the
 * boundary, and the footer's section headings are on screen while `main` still
 * holds the skeleton from `products/loading.tsx` — which has no heading of its
 * own. A catalogue search counted zero products that way and reported a
 * published product as missing from the shop.
 *
 * So the wait is for a heading INSIDE `main`, which no skeleton renders.
 */
export async function gotoRendered(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('main').getByRole('heading').first()).toBeVisible();
}

/**
 * Open a product that can actually be bought, and return its path.
 *
 * Not "the first card": a card renders for an out-of-stock product too, and
 * its add-to-cart button is correctly disabled, so a test that picked one
 * would fail on the shop working as designed. The catalogue's own in-stock
 * filter answers this in SQL — the same filter a customer would use.
 *
 * The href is read and navigated rather than clicked, because a client-side
 * navigation resolves a tick after the click and the catalogue's own `h1` is
 * already on screen: waiting for "a heading" after clicking passes instantly
 * on the page being left. That race cost an hour the first time.
 */
export async function openPurchasableProduct(page: Page): Promise<string> {
  await gotoRendered(page, '/ar/products?stock=1');

  const href = await page
    .locator('main a[href*="/ar/products/"]')
    .first()
    .getAttribute('href');

  expect(href, 'the in-stock catalogue rendered no product to buy').toBeTruthy();

  await gotoRendered(page, href!);
  await expect(
    page.getByRole('button', { name: t('product.addToCart') }).first(),
  ).toBeEnabled();

  return href!;
}

/**
 * Add the selected variant, and wait for the server to say it landed.
 *
 * The button flips to `cart.itemAdded` only once the Server Action resolves,
 * so that label — not a timeout — is the signal. A `waitForTimeout` here is
 * what makes a suite flaky on a slow machine and green on a fast one.
 */
export async function addSelectedVariantToCart(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: t('product.addToCart') })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: t('cart.itemAdded') }).first(),
  ).toBeVisible();
}

/**
 * Every price rendered inside `locator`, in whole dinars.
 *
 * Built from `common.currency` rather than the literal "د.ع", for the reason
 * at the top of this file, and reading the rendered text rather than a class
 * name because `ProductPrice` is a design-system component with no test hook —
 * adding one for this would be a second contract to keep in step.
 */
export async function readPrices(locator: Locator): Promise<number[]> {
  const text = (await locator.innerText()).replace(/\s+/g, ' ');
  const currency = t('common.currency').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = text.matchAll(new RegExp(`([\\d,]+)\\s*${currency}`, 'g'));
  return [...matches].map((match) => Number((match[1] ?? '').replace(/,/g, '')));
}

/**
 * The first price inside `locator`, or a failure naming what was there instead.
 *
 * Separate from `readPrices` because `noUncheckedIndexedAccess` makes `[0]`
 * possibly-undefined, and the honest way to resolve that is to say what went
 * wrong rather than to assert non-null and lose the text that would explain it.
 */
export async function readFirstPrice(locator: Locator): Promise<number> {
  const [price] = await readPrices(locator);

  if (price === undefined) {
    throw new Error(
      `expected a price here, found: "${(await locator.innerText()).replace(/\s+/g, ' ')}"`,
    );
  }

  return price;
}

/** The header's cart link, which carries the count badge inside it. */
export function cartLink(page: Page): Locator {
  return page.getByRole('link', { name: t('nav.cart') }).first();
}

/**
 * Fill every checkout field and wait for the delivery quote to arrive.
 *
 * The governorate is chosen by value rather than by its translated label
 * because the form submits the `Governorate` enum, which is what `DeliveryRate`
 * is keyed by. Baghdad has a fee in the seed, so a quote that never arrives
 * cannot pass as a legitimate zero.
 */
export async function fillCheckout(page: Page, governorate = 'BAGHDAD'): Promise<void> {
  await page.fill('input[name="fullName"]', CHECKOUT.fullName);
  await page.fill('input[name="phone"]', CHECKOUT.phone);
  await page.selectOption('select[name="governorate"]', governorate);
  await page.fill('input[name="city"]', CHECKOUT.city);
  await page.fill('textarea[name="addressLine"]', CHECKOUT.addressLine);

  // The fee is quoted by the server the moment a governorate is picked, using
  // the same function that will price the order. Waiting for it is what makes
  // "what was displayed is what was charged" testable at all.
  await expect(page.getByText(tPrefix('checkout.deliveryEta')).first()).toBeVisible();
}

/**
 * Fill checkout and submit, returning the order number from the URL.
 *
 * Split from `fillCheckout` so a test can do something between the two — the
 * coupon spec has to read a quoted total before it is charged, which is the
 * whole claim it exists to make.
 */
export async function submitCheckout(
  page: Page,
  governorate = 'BAGHDAD',
): Promise<string> {
  await fillCheckout(page, governorate);

  await page.getByRole('button', { name: t('checkout.submit') }).click();
  await page.waitForURL(/\/ar\/orders\/MPS-/);

  const number = page.url().split('/').pop() ?? '';
  expect(number).toMatch(/^MPS-\d{5}-\d{4}$/);
  return number;
}

/**
 * Sign in over the real HTTP router, which is where the rate limits live (§7).
 *
 * `next` is passed through because the sign-in page decides the destination
 * itself, and `?next=admin` is honoured only for someone who can actually open
 * the dashboard — the distinction that stopped a redirect loop (§8).
 */
export async function signIn(
  page: Page,
  credentials: { email: string; password: string },
  next?: 'admin' | 'account',
): Promise<void> {
  await gotoRendered(page, next ? `/ar/sign-in?next=${next}` : '/ar/sign-in');
  await page.fill('input[name="email"]', credentials.email);
  await page.fill('input[name="password"]', credentials.password);
  await page.getByRole('button', { name: t('auth.signIn'), exact: true }).click();
}

/**
 * Scroll to the bottom and wait for it to stop moving before reading rects.
 *
 * Shared, because two specs measure a bar against the footer and a second copy
 * is how they start disagreeing about what "at the bottom" means (§13.16). One
 * `scrollTo` is NOT enough on its own: images finish loading and the document
 * grows underneath, so a single call lands short and the footer is still off
 * screen. The poll keeps scrolling until two readings agree.
 */
export async function scrollToSettledBottom(page: Page): Promise<void> {
  let previous = -1;

  // A mid-scroll reading once reported the copyright line as covered by the
  // buy bar when the real clearance was 51px (§17). Images finish loading and
  // the document grows, so "scrolled once" is not "at the bottom" — the poll
  // keeps scrolling until two readings agree.
  await expect
    .poll(
      async () => {
        const y = await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          return Math.round(window.scrollY);
        });
        const settled = y === previous && y > 0;
        previous = y;
        return settled;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
}
