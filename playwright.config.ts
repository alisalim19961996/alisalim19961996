import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: a real browser against a real build against a real
 * database.
 *
 * Everything below `lib/` is unit-tested and everything in `server/services`
 * is integration-tested, and both were still blind to the bug that shipped —
 * product cards sized to their own names — because neither of them renders
 * anything. These tests drive the flows that were previously checked by hand
 * before each phase was called done: buy something, fail to read somebody
 * else's order, edit the catalogue as staff.
 *
 * `.env` is loaded here the way `server/db/seed.ts` loads it: the test runner
 * is a plain Node process outside Next, so without it the admin spec has no
 * password to sign in with and DATABASE_URL never reaches the server it starts.
 *
 * Run with:  pnpm build   then   pnpm test:e2e
 */

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * An escape hatch for a machine whose Chromium is not the one this Playwright
 * version downloads.
 *
 * Unset — the owner's machine, and CI after `playwright install chromium` —
 * Playwright resolves its own browser and this changes nothing. It exists
 * because a sandbox can ship a pinned Chromium at a fixed path, and hard-
 * coding that path here would be a second machine's layout living in the
 * repository (§13.16).
 */
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  /**
   * One worker, because these share one database and one catalogue.
   *
   * The admin spec publishes and unpublishes a real product; the buying spec
   * expects the catalogue it is browsing to hold still. Running them side by
   * side would produce a failure that reproduces roughly one time in three,
   * which is the most expensive kind. `vitest.integration.config.mts` is
   * serial for the same reason.
   */
  workers: 1,
  fullyParallel: false,

  /**
   * No retries, deliberately, and none in CI either.
   *
   * A retry turns a real intermittent bug — a race in the cart, a badge that
   * updates a tick late — into a green run with a note nobody reads. If a test
   * here is flaky, the flake is the finding.
   */
  retries: 0,

  /*
    In CI: annotations on the pull request, a line per test in the log, and an
    HTML report the workflow uploads when something fails — a trace and a
    screenshot of the exact moment beat "a test went red on a machine you
    cannot see". Locally just the lines, because the report opens a browser.
  */
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    // Arabic is the default locale and the one every customer lands on, so it
    // is the one the tests drive. The English routes are covered where they
    // differ — the layout spec measures both.
    locale: 'ar-IQ',
    timezoneId: 'Asia/Baghdad',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        ...(CHROMIUM_PATH ? { launchOptions: { executablePath: CHROMIUM_PATH } } : {}),
      },
    },
  ],

  /**
   * A fresh server per run, never a reused one.
   *
   * Playwright's usual `reuseExistingServer: !process.env.CI` is wrong for
   * this project: a `next start` left over from an earlier session serves the
   * PREVIOUS build, and a suite that measures the previous build reports on
   * code nobody is looking at — which has cost debugging time here more than
   * once (CLAUDE.md §17). Refusing to reuse turns that into a port-in-use
   * error naming the problem, which costs one command instead of an
   * afternoon.
   *
   * The port is not 3000 for the same reason: the owner's `pnpm dev` can stay
   * open while the suite runs.
   */
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      // better-auth answers every sign-in with 403 when its origin check sees
      // a host it was not configured for, and to a test that is indis-
      // tinguishable from a wrong password (§7).
      BETTER_AUTH_URL: BASE_URL,
      NEXT_PUBLIC_APP_URL: BASE_URL,
    },
  },
});
