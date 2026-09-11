/**
 * Generates the placeholder product images used by the demo catalogue.
 *
 * Why generate rather than commit hand-made art: a catalogue of identical grey
 * boxes reads as an unfinished wireframe, which makes every layout decision
 * above it impossible to judge. These are device silhouettes tinted with each
 * brand's accent, so the grid has the visual rhythm a real catalogue has while
 * still being obviously not photography.
 *
 * They are rasterised rather than served as SVG on purpose: serving SVG through
 * next/image requires dangerouslyAllowSVG, and a storefront that will later
 * accept admin image uploads should not have that switch on at all. JPEG rather
 * than PNG because these are flat gradients with no transparency — PNG cost
 * ~340KB a file for the same picture JPEG stores in 21KB.
 *
 * Run with:  node scripts/generate-demo-images.mjs
 * Output:    public/demo/products/*.jpg  (committed)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const OUT_DIR = 'public/demo/products';
const WIDTH = 1000;
const HEIGHT = 1250; // 4:5, the aspect every product image in the UI uses.

/** Devices are drawn, not photographed, so each kind needs its own silhouette. */
function phoneBody(accent) {
  return `
    <rect x="282" y="128" width="436" height="900" rx="62" fill="#111114"/>
    <rect x="298" y="144" width="404" height="868" rx="50" fill="url(#screen)"/>
    <rect x="452" y="166" width="96" height="12" rx="6" fill="#111114" opacity="0.9"/>
    <g transform="translate(324,176)">
      <rect width="104" height="104" rx="30" fill="#16161a"/>
      <circle cx="37" cy="37" r="19" fill="${accent}" opacity="0.85"/>
      <circle cx="37" cy="37" r="7" fill="#0A0A0B"/>
      <circle cx="71" cy="71" r="14" fill="#2a2a30"/>
    </g>`;
}

function tabletBody(accent) {
  return `
    <rect x="170" y="190" width="660" height="820" rx="44" fill="#111114"/>
    <rect x="190" y="210" width="620" height="780" rx="32" fill="url(#screen)"/>
    <g transform="translate(222,244)">
      <rect width="78" height="78" rx="24" fill="#16161a"/>
      <circle cx="29" cy="29" r="15" fill="${accent}" opacity="0.85"/>
      <circle cx="29" cy="29" r="5" fill="#0A0A0B"/>
    </g>`;
}

function accessoryBody(accent) {
  return `
    <rect x="200" y="440" width="600" height="360" rx="60" fill="#111114"/>
    <rect x="230" y="470" width="540" height="300" rx="44" fill="url(#screen)"/>
    <g transform="translate(288,578)">
      <rect width="196" height="22" rx="11" fill="${accent}" opacity="0.9"/>
      <rect width="136" height="22" rx="11" y="48" fill="#2a2a30"/>
    </g>
    <circle cx="692" cy="620" r="28" fill="${accent}" opacity="0.5"/>`;
}

const BODIES = {
  phone: phoneBody,
  tablet: tabletBody,
  accessory: accessoryBody,
};

/** Contact shadow, sized and placed under each silhouette's actual footprint. */
const SHADOWS = {
  phone: { cy: 1068, rx: 252 },
  tablet: { cy: 1050, rx: 330 },
  accessory: { cy: 840, rx: 300 },
};

function svg({ kind, accent }) {
  const body = (BODIES[kind] ?? phoneBody)(accent);
  const shadow = SHADOWS[kind] ?? SHADOWS.phone;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F2F2F4"/>
    </linearGradient>
    <radialGradient id="tint" cx="50%" cy="38%" r="52%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="screen" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="#26262c"/>
      <stop offset="55%" stop-color="#17171b"/>
      <stop offset="100%" stop-color="#0d0d10"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#tint)"/>
  <ellipse cx="500" cy="${shadow.cy}" rx="${shadow.rx}" ry="30" fill="#0A0A0B" opacity="0.07"/>
  ${body}
</svg>`;
}

/**
 * One image per (device kind, brand accent) pair rather than per product:
 * products of the same kind and brand would otherwise get byte-identical files
 * under different names.
 */
export const DEMO_IMAGE_SET = [
  { key: 'phone-tecno', kind: 'phone', accent: '#0057FF' },
  { key: 'phone-infinix', kind: 'phone', accent: '#00B14F' },
  { key: 'phone-realme', kind: 'phone', accent: '#FFC915' },
  { key: 'phone-honor', kind: 'phone', accent: '#0B57D0' },
  { key: 'phone-samsung', kind: 'phone', accent: '#1428A0' },
  { key: 'phone-xiaomi', kind: 'phone', accent: '#FF6900' },
  { key: 'tablet-samsung', kind: 'tablet', accent: '#1428A0' },
  { key: 'tablet-xiaomi', kind: 'tablet', accent: '#FF6900' },
  { key: 'accessory-xiaomi', kind: 'accessory', accent: '#FF6900' },
  { key: 'accessory-samsung', kind: 'accessory', accent: '#1428A0' },
  { key: 'accessory-honor', kind: 'accessory', accent: '#0B57D0' },
  { key: 'accessory-realme', kind: 'accessory', accent: '#FFC915' },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });

  for (const spec of DEMO_IMAGE_SET) {
    const markup = svg(spec);
    await page.setContent(`<body style="margin:0">${markup}</body>`, {
      waitUntil: 'load',
    });
    const image = await page.screenshot({ type: 'jpeg', quality: 88 });
    await writeFile(`${OUT_DIR}/${spec.key}.jpg`, image);
    console.log(`  ${spec.key}.jpg`);
  }

  await browser.close();
  console.log(`\n${DEMO_IMAGE_SET.length} demo images written to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
