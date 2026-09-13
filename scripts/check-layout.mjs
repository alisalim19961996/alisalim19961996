/**
 * Measure the layout facts CLAUDE.md §10 asserts, instead of trusting them.
 *
 * Written after a real one went unnoticed: every product card was as wide as
 * its own product name, because the card is a flex item and never asked to
 * fill its grid cell. The grid columns were a uniform 292px underneath, so the
 * page looked deliberate — four cards in a row measured 209, 219, 161 and 155
 * pixels across, each with a different image height. Nothing failed, no test
 * covered it, and the owner is the one who noticed.
 *
 * Reading a rendered page is the only way to catch that class of bug, so this
 * reads one. Three traps that have produced false reports here are avoided by
 * construction (CLAUDE.md §17): wait for a real selector rather than `load`,
 * let the page settle before measuring, and match elements on structure rather
 * than on `:last-of-type`.
 *
 * Usage:  pnpm dev   (or pnpm start), then:  pnpm check:layout
 */
import { chromium } from '@playwright/test';

const BASE = process.env.LAYOUT_BASE_URL ?? 'http://localhost:3000';
const ESC = String.fromCharCode(27);
const c = {
  reset: `${ESC}[0m`,
  bold: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  red: `${ESC}[31m`,
  green: `${ESC}[32m`,
  cyan: `${ESC}[36m`,
};

const say = (m = '') => console.log(m);
const ok = (m) => say(`  ${c.green}OK${c.reset}  ${m}`);
const bad = (m) => say(`  ${c.red}XX${c.reset}  ${m}`);
const hint = (m) => say(`      ${c.dim}${m}${c.reset}`);

const PAGES = ['/ar', '/ar/products', '/en'];
const WIDTHS = [390, 1440];

let failures = 0;

/** One row of product cards, as the browser actually laid it out. */
async function readCardRows(page) {
  return page.$$eval('ul', (lists) =>
    lists
      .filter((ul) => ul.querySelector('li > a > div'))
      .map((ul) => ({
        heading:
          ul.closest('section')?.querySelector('h1, h2')?.textContent?.trim() ??
          '(بدون عنوان)',
        cards: [...ul.querySelectorAll('li > a')].map((card) => {
          const box = card.firstElementChild?.getBoundingClientRect();
          const rect = card.getBoundingClientRect();
          return {
            width: Math.round(rect.width),
            imageHeight: box ? Math.round(box.height) : 0,
            imageWidth: box ? Math.round(box.width) : 0,
            name: card.querySelector('h3')?.textContent?.trim().slice(0, 20) ?? '',
          };
        }),
      }))
      .filter((row) => row.cards.length > 1),
  );
}

async function check(page, path, width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  // Not `load`: pages stream inside Suspense, so the DOM can still be empty.
  await page.waitForSelector('h1');
  await page.waitForLoadState('networkidle').catch(() => {});

  say(`\n${c.bold}${c.cyan}${path}  @${width}px${c.reset}`);

  // -- Every card in a row is the same size --------------------------------
  const rows = await readCardRows(page);
  if (rows.length === 0) hint('ماكو صفوف منتجات بهذه الصفحة.');

  for (const row of rows) {
    const widths = [...new Set(row.cards.map((card) => card.width))];
    const heights = [...new Set(row.cards.map((card) => card.imageHeight))];

    if (widths.length === 1 && heights.length === 1) {
      ok(`${row.heading} — ${row.cards.length} كارت، كلهن ${widths[0]}×${heights[0]}`);
      continue;
    }

    failures += 1;
    bad(`${row.heading} — الكروت مو بنفس القياس`);
    for (const card of row.cards) {
      hint(
        `عرض ${String(card.width).padStart(4)}  ارتفاع الصورة ${String(card.imageHeight).padStart(4)}  ${card.name}`,
      );
    }
  }

  // -- Nothing scrolls sideways --------------------------------------------
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scroll: doc.scrollWidth, client: doc.clientWidth };
  });
  if (overflow.scroll > overflow.client + 1) {
    failures += 1;
    bad(`الصفحة تنزلق أفقيًا: ${overflow.scroll}px داخل ${overflow.client}px`);
  } else {
    ok('ماكو انزلاق أفقي');
  }
}

async function main() {
  say(`${c.bold}فحص التخطيط${c.reset}`);
  hint(`الموقع: ${BASE} — لازم يكون شغّال (pnpm dev أو pnpm start)`);

  const reachable = await fetch(`${BASE}/ar`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!reachable) {
    bad('ما كدرنا نفتح الموقع.');
    hint('شغّله بترمنال ثاني: pnpm dev');
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium',
  });
  const page = await browser.newPage();

  try {
    for (const path of PAGES) {
      for (const width of WIDTHS) await check(page, path, width);
    }
  } finally {
    await browser.close();
  }

  say(`\n${c.bold}الخلاصة${c.reset}`);
  if (failures > 0) {
    bad(`${failures} مشكلة تخطيط.`);
    process.exitCode = 1;
    return;
  }
  ok('كل الكروت بنفس القياس، وماكو انزلاق أفقي.');
}

await main();
