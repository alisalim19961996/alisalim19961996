import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The colour tokens, against the contrast floor.
 *
 * Here because two of them did not pass and nothing said so: `--color-subtle`
 * was #9ca3af at **2.43:1** against the page ground — the brand line on every
 * product card, every date, every SKU — and `--color-success` was 4.23:1,
 * which is the "in stock" line on a product. Both look fine to someone with
 * good eyesight on a good screen, which is exactly why a number is needed
 * rather than an opinion.
 *
 * It reads the tokens out of `app/globals.css` rather than repeating them, so
 * a token changed there is measured here and cannot drift (§13.16). This is
 * one test for the whole palette, not a test per colour.
 */

const CSS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(CSS);
  if (!match?.[1]) throw new Error(`--color-${name} is not a hex token in globals.css`);
  return match[1];
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map(
    (index) => parseInt(hex.slice(index, index + 2), 16) / 255,
  );
  const linear = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/*
  Measured against the CANVAS, not white. The canvas is the page ground and
  cards sit on it, so it is the lighter of the two backgrounds a given text
  colour meets — and therefore the one that decides whether it passes.
*/
const grounds = [
  ['canvas', token('canvas')],
  ['surface', token('surface')],
] as const;

describe('text colours clear the 4.5:1 floor', () => {
  it.each(['ink', 'ink-soft', 'muted', 'subtle', 'success', 'warning', 'danger'])(
    '--color-%s',
    (name) => {
      const colour = token(name);

      for (const [ground, background] of grounds) {
        const ratio = contrast(colour, background);
        expect(
          Number(ratio.toFixed(2)),
          `--color-${name} (${colour}) on ${ground} (${background})`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});

describe('the primary button is readable', () => {
  it('white text on the brand red', () => {
    // 3:1 rather than 4.5, because button text is 16px semibold — large text
    // by WCAG's definition — and the brand colour is the owner's, not a
    // choice to be optimised away.
    const ratio = contrast(token('surface'), token('primary'));
    expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(3);
  });

  it('and on the hover shade, which is darker still', () => {
    expect(contrast(token('surface'), token('primary-hover'))).toBeGreaterThan(
      contrast(token('surface'), token('primary')),
    );
  });
});

describe('a field has an edge somebody can find', () => {
  /*
    WCAG 1.4.11 is a 3:1 requirement on the boundary of a control, and the
    inputs were drawn with `--color-border-strong` at **1.49:1**. The fix is a
    token of its own rather than darkening every hairline: the lines between
    table rows are decorative and exempt, and darkening those makes a dense
    admin table look like a spreadsheet.
  */
  it.each([
    ['surface', 'surface'],
    ['canvas', 'canvas'],
  ])('the field border clears 3:1 on the %s', (_label, ground) => {
    const ratio = contrast(token('border-field'), token(ground));
    expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(3);
  });
});
