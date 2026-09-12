import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Architecture guardrails.
 *
 * CLAUDE.md states the rules this project is built on. A rule that is only
 * written down is a rule that gets broken quietly — by a contributor who never
 * read it, or by an assistant whose context was compacted. These tests turn the
 * important ones into failures.
 *
 * Every failure message names the file, the line and the fix, because a
 * guardrail that just says "violation found" costs more time than it saves.
 */

const ROOT = process.cwd();

function walk(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(join(ROOT, dir));
  } catch {
    return out;
  }

  for (const entry of entries) {
    const rel = join(dir, entry);
    const abs = join(ROOT, rel);
    if (statSync(abs).isDirectory()) {
      out.push(...walk(rel, extensions));
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      out.push(rel);
    }
  }
  return out;
}

/** Source files, excluding comments, so a rule quoted in a comment is not a hit. */
function readCode(file: string): { line: number; text: string }[] {
  const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
  let inBlockComment = false;

  return lines
    .map((text, index) => ({ line: index + 1, text }))
    .filter(({ text }) => {
      const trimmed = text.trim();
      if (inBlockComment) {
        if (trimmed.includes('*/')) inBlockComment = false;
        return false;
      }
      if (trimmed.startsWith('/*')) {
        if (!trimmed.includes('*/')) inBlockComment = true;
        return false;
      }
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    });
}

const UI_DIRS = ['app', 'components', 'features'];
const uiFiles = UI_DIRS.flatMap((dir) => walk(dir, ['.ts', '.tsx']));

// ---------------------------------------------------------------------------

describe('translations stay in step', () => {
  type Messages = { [key: string]: string | Messages };

  const flatten = (obj: Messages, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([key, value]) =>
      typeof value === 'object'
        ? flatten(value, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    );

  const ar = JSON.parse(
    readFileSync(join(ROOT, 'messages/ar.json'), 'utf8'),
  ) as Messages;
  const en = JSON.parse(
    readFileSync(join(ROOT, 'messages/en.json'), 'utf8'),
  ) as Messages;

  it('has the same keys in both locales', () => {
    const arKeys = flatten(ar).sort();
    const enKeys = flatten(en).sort();

    const missingInEn = arKeys.filter((key) => !enKeys.includes(key));
    const missingInAr = enKeys.filter((key) => !arKeys.includes(key));

    expect(
      { missingInEn, missingInAr },
      'A key added to one locale must be added to the other, or that string ' +
        'renders as a raw key for half the customers.',
    ).toEqual({ missingInEn: [], missingInAr: [] });
  });

  it('has no empty strings', () => {
    const empties: string[] = [];
    const scan = (obj: Messages, locale: string, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object') scan(value, locale, `${prefix}${key}.`);
        else if (value.trim() === '') empties.push(`${locale}:${prefix}${key}`);
      }
    };
    scan(ar, 'ar');
    scan(en, 'en');

    expect(empties, 'An empty translation renders as nothing at all.').toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('RTL safety', () => {
  /**
   * Physical direction utilities break Arabic silently: the layout still
   * renders, it is just mirrored wrongly, which nobody notices until a customer
   * does. Logical properties (ms/me/ps/pe/start/end) are the only safe form.
   */
  const PHYSICAL =
    /\b(?:ml|mr|pl|pr|border-l|border-r|rounded-l|rounded-r)-(?:\d|px|\[)/;
  const PHYSICAL_POSITION = /\b(?:left|right)-(?:\d|px|full|\[)/;

  it('uses logical properties, never physical ones', () => {
    const offences: string[] = [];

    for (const file of uiFiles) {
      for (const { line, text } of readCode(file)) {
        if (PHYSICAL.test(text) || PHYSICAL_POSITION.test(text)) {
          offences.push(`${file}:${line} → ${text.trim().slice(0, 90)}`);
        }
      }
    }

    expect(
      offences,
      'Use ms-/me-/ps-/pe-/start-/end- instead. Physical directions do not ' +
        'flip in RTL, so the Arabic layout comes out wrong.',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('design tokens', () => {
  /**
   * Colours live once, in app/globals.css under @theme. A hex in a component
   * is a colour nobody can change centrally — and the first step towards two
   * slightly different reds.
   *
   * Brand accent colours are data (Brand.accentColor), applied via inline style
   * from the database, which is why `style={{ backgroundColor: ... }}` is fine
   * but a literal hex is not.
   */
  const HEX = /#[0-9a-fA-F]{6}\b/;

  it('has no hard-coded colours in UI files', () => {
    const offences: string[] = [];

    for (const file of uiFiles) {
      for (const { line, text } of readCode(file)) {
        if (HEX.test(text)) {
          offences.push(`${file}:${line} → ${text.trim().slice(0, 90)}`);
        }
      }
    }

    expect(
      offences,
      'Add the colour to @theme in app/globals.css and use the token. ' +
        'Values that legitimately vary per row belong in the database.',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('layer boundaries', () => {
  /**
   * UI → server/queries|services → server/db. A component that reaches past the
   * query layer into Prisma bypasses every rule those layers enforce, and the
   * bypass is invisible in review because the code still works.
   */
  it('keeps the Prisma client out of the UI', () => {
    const offences: string[] = [];

    for (const file of uiFiles) {
      for (const { line, text } of readCode(file)) {
        if (/from ['"]@\/server\/db/.test(text)) {
          offences.push(`${file}:${line} → ${text.trim()}`);
        }
      }
    }

    expect(
      offences,
      'Components must go through server/queries or server/services. ' +
        'Importing the Prisma client directly skips the layer that owns the rules.',
    ).toEqual([]);
  });

  it('keeps lib/ free of framework and server imports', () => {
    // lib/ is where the pure logic lives — money, phones, search, availability.
    // It stays testable without a database or a request only if it imports
    // neither. Prisma *enums* are allowed: they are string constants.
    const offences: string[] = [];

    for (const file of walk('lib', ['.ts'])) {
      for (const { line, text } of readCode(file)) {
        if (/from ['"]next/.test(text) || /from ['"]@\/server/.test(text)) {
          offences.push(`${file}:${line} → ${text.trim()}`);
        }
      }
    }

    expect(
      offences,
      'lib/ must run in a plain Node test with no request and no database.',
    ).toEqual([]);
  });

  it('keeps UI primitives independent of features and data', () => {
    const offences: string[] = [];

    for (const file of walk('components/ui', ['.tsx', '.ts'])) {
      for (const { line, text } of readCode(file)) {
        if (/from ['"]@\/(features|server)/.test(text)) {
          offences.push(`${file}:${line} → ${text.trim()}`);
        }
      }
    }

    expect(
      offences,
      'components/ui holds generic primitives. A Button that knows about ' +
        'products cannot be reused for anything else.',
    ).toEqual([]);
  });

  it('does not import server-only modules into client components', () => {
    const offences: string[] = [];

    for (const file of uiFiles.filter((f) => f.endsWith('.tsx'))) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      if (!source.includes("'use client'")) continue;

      for (const { line, text } of readCode(file)) {
        // A type-only import is erased at build time and is safe.
        if (/from ['"]@\/server\//.test(text) && !/^\s*import type/.test(text)) {
          offences.push(`${file}:${line} → ${text.trim()}`);
        }
      }
    }

    expect(
      offences,
      'A client component may only import types from server/. Anything else ' +
        'drags server code into the browser bundle.',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('no invented or hard-coded commercial data', () => {
  /**
   * Prices, delivery fees and contact details come from SiteSetting and
   * DeliveryRate so the owner can change them without a deployment. A literal
   * in a component is a number only a developer can fix.
   */
  it('has no literal IQD prices in UI files', () => {
    const offences: string[] = [];
    // Six or more digits next to a currency word is a price, not a pixel value.
    const PRICE = /\b\d{6,}\b[^\n]{0,20}(?:IQD|د\.ع|دينار)/;

    for (const file of uiFiles) {
      for (const { line, text } of readCode(file)) {
        if (PRICE.test(text)) {
          offences.push(`${file}:${line} → ${text.trim().slice(0, 90)}`);
        }
      }
    }

    expect(offences, 'Prices come from the database. See CLAUDE.md §13.13.').toEqual(
      [],
    );
  });
});

// ---------------------------------------------------------------------------

describe('translated text is not inlined in components', () => {
  /**
   * Arabic sitting in a .tsx file cannot be edited by the owner, cannot be
   * reviewed as copy, and has no English counterpart. It all belongs in
   * messages/.
   */
  it('has no Arabic string literals in UI files', () => {
    const ARABIC_IN_QUOTES = /['"`][^'"`]*[؀-ۿ][^'"`]*['"`]/;
    const offences: string[] = [];

    for (const file of uiFiles) {
      for (const { line, text } of readCode(file)) {
        if (ARABIC_IN_QUOTES.test(text)) {
          offences.push(`${file}:${line} → ${text.trim().slice(0, 90)}`);
        }
      }
    }

    expect(
      offences,
      'Move the string to messages/ar.json and messages/en.json, then read it ' +
        'with useTranslations / getTranslations.',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('server layer is sealed', () => {
  /**
   * `import 'server-only'` is what makes a leak into a client bundle a BUILD
   * error rather than a silent shipping of database code to the browser. The
   * marker only works if it is the first import, so this checks the first line.
   *
   * The corollary is that anything under server/ cannot be unit-tested
   * directly — `server-only` throws under vitest. That is the test for whether
   * a file belongs here at all: pure logic that wants a unit test belongs in
   * lib/domain/. order-state.ts sat in server/services/ without the marker for
   * exactly that reason, and this test is why it moved.
   */
  it.each(['server/queries', 'server/services'])(
    'every file in %s starts with server-only',
    (dir) => {
      const offences = walk(dir, ['.ts']).filter((file) => {
        const first = readFileSync(join(ROOT, file), 'utf8')
          .split('\n')
          .find((line) => line.trim() !== '');
        return first?.trim() !== "import 'server-only';";
      });

      expect(
        offences,
        "Add `import 'server-only';` as the first line — or move the file to " +
          'lib/domain/ if it is pure logic that needs a unit test.',
      ).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------

describe('config stays honest', () => {
  /**
   * A config file whose constants nothing reads is worse than no config file:
   * it reads like the source of truth while the real number lives inline
   * somewhere else. Three of these had already drifted that way before this
   * test existed.
   */
  const consumers = [
    ...uiFiles,
    ...walk('server', ['.ts']),
    ...walk('schemas', ['.ts']),
  ];

  const exportsOf = (file: string): string[] =>
    [...readFileSync(join(ROOT, file), 'utf8').matchAll(/^export const (\w+)/gm)].map(
      (match) => match[1] as string,
    );

  it.each(['config/ui.ts', 'config/nav.ts'])('every export of %s is used', (config) => {
    const unused = exportsOf(config).filter(
      (name) =>
        !consumers.some((file) =>
          new RegExp(`\\b${name}\\b`).test(readFileSync(join(ROOT, file), 'utf8')),
        ),
    );

    expect(
      unused,
      'Either wire the constant up or delete it. A value kept "for later" is ' +
        'a number nobody trusts by the time later arrives.',
    ).toEqual([]);
  });

  it('keeps the product image ratio in @theme, not inline', () => {
    // Tailwind scans class names statically, so a ratio interpolated from a
    // TypeScript constant would silently never be generated. The token is the
    // only form that works AND stays changeable in one place.
    const offences: string[] = [];

    for (const file of uiFiles) {
      for (const { line, text } of readCode(file)) {
        if (/aspect-\[\d+\s*\/\s*\d+\]/.test(text)) {
          offences.push(`${file}:${line} → ${text.trim().slice(0, 90)}`);
        }
      }
    }

    expect(
      offences,
      'Use `aspect-product`, defined once as --aspect-product in app/globals.css.',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('file layout', () => {
  it('does not place business logic directly in app/', () => {
    // app/ holds routing, metadata and composition. Logic there cannot be
    // tested without booting Next, and cannot be reused by the admin later.
    const offences: string[] = [];

    for (const file of walk('app', ['.tsx', '.ts'])) {
      const lineCount = readFileSync(join(ROOT, file), 'utf8').split('\n').length;
      if (lineCount > 420) {
        offences.push(`${relative('.', file)} is ${lineCount} lines`);
      }
    }

    expect(
      offences,
      'A route file this long is holding logic that belongs in features/ or ' +
        'server/. Split it before it grows further.',
    ).toEqual([]);
  });
});
