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

/**
 * One pixel, because CSS Grid's own remainder is not a bug. Five `1fr`
 * columns across 1216px come out as 230.391px and 230.406px alternating —
 * a sixty-fourth of a pixel — and rounding that made one image measure 285
 * and its neighbour 286. The bug this script was written for had a 64px
 * spread across one row, so a whole pixel of slack costs nothing and stops
 * the script from reporting arithmetic as a defect.
 */
const TOLERANCE = 1;

const spread = (values) => Math.max(...values) - Math.min(...values);
const px = (value) => String(Math.round(value * 100) / 100).padStart(7);

/** Cards sharing a top edge are one visual row, whatever the grid says. */
function groupByRow(cards) {
  const rows = [];
  for (const card of cards) {
    const row = rows.find((r) => Math.abs(r[0].top - card.top) <= TOLERANCE);
    if (row) row.push(card);
    else rows.push([card]);
  }
  return rows;
}

let failures = 0;

/**
 * A card counts as being in the row only if the browser is actually painting
 * it. A homepage rail renders five cards and hides the fifth below `xl`, where
 * the grid is four wide — a hidden card has no box at all, and comparing its
 * zeros against four real cards reports a bug that nobody can see.
 *
 * `checkVisibility()` is the question being asked, not `width > 0`: a card
 * that collapsed to nothing while still being displayed IS the bug this
 * script exists to catch, so an unmeasurable card defaults to visible and
 * fails loudly rather than being skipped.
 */
/** One row of product cards, as the browser actually laid it out. */
async function readCardRows(page) {
  return page.$$eval('ul', (lists) =>
    lists
      .filter((ul) => ul.querySelector('li > a > div'))
      .map((ul) => ({
        heading:
          ul.closest('section')?.querySelector('h1, h2')?.textContent?.trim() ??
          '(بدون عنوان)',
        cards: [...ul.querySelectorAll('li > a')]
          .filter((card) =>
            typeof card.checkVisibility === 'function' ? card.checkVisibility() : true,
          )
          .map((card) => {
            const box = card.firstElementChild?.getBoundingClientRect();
            const rect = card.getBoundingClientRect();
            return {
              top: rect.top,
              width: rect.width,
              height: rect.height,
              imageHeight: box ? box.height : 0,
              imageWidth: box ? box.width : 0,
              name: card.querySelector('h3')?.textContent?.trim().slice(0, 20) ?? '',
            };
          }),
        hidden: [...ul.querySelectorAll('li > a')].filter((card) =>
          typeof card.checkVisibility === 'function' ? !card.checkVisibility() : false,
        ).length,
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

  for (const list of rows) {
    /*
      Width and the image box come from the grid column, so they must match
      across the whole list. Card HEIGHT is only promised inside one visual
      row: a grid item stretches to the tallest card beside it, not to the
      tallest on the page, so a two-line name in row one does not oblige row
      two to be as tall. Comparing those across rows reports a bug that is
      really just two rows of different content.
    */
    const uneven = ['width', 'imageHeight'].filter(
      (key) => spread(list.cards.map((card) => card[key])) > TOLERANCE,
    );
    const visualRows = groupByRow(list.cards);
    const raggedRows = visualRows.filter(
      (row) => spread(row.map((card) => card.height)) > TOLERANCE,
    );

    if (uneven.length === 0 && raggedRows.length === 0) {
      const first = list.cards[0];
      const also = list.hidden > 0 ? `، و${list.hidden} مخفي` : '';
      ok(
        `${list.heading} — ${list.cards.length} كارت ظاهر${also} بـ ` +
          `${visualRows.length} صف، عرض ${Math.round(first.width)} ` +
          `والصورة ${Math.round(first.imageHeight)}`,
      );
      continue;
    }

    failures += 1;
    bad(
      `${list.heading} — ` +
        (uneven.length > 0
          ? 'الكروت مو بنفس القياس'
          : 'كروت بنفس الصف مو بنفس الارتفاع'),
    );
    for (const card of list.cards) {
      hint(
        `عرض ${px(card.width)}  ارتفاع الكارت ${px(card.height)}  ` +
          `ارتفاع الصورة ${px(card.imageHeight)}  ${card.name}`,
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
