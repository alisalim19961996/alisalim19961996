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

describe('end-to-end specs read the real copy', () => {
  /**
   * An e2e spec that hard-codes "أضف إلى السلة" is a second copy of the
   * owner's copy. It breaks the day they reword a button — which is not a
   * defect — and, worse, it keeps passing if the page ever renders a raw key
   * like `cart.checkout`, which is. Going through `t()` in tests/e2e/fixtures.ts
   * means the label the test looks for is the label the page was told to draw.
   *
   * `fixtures.ts` itself is exempt: the customer name, city and street it
   * submits at checkout are the test's own input, they belong nowhere else,
   * and an address in `messages/` would be UI copy that no page renders.
   */
  it('has no Arabic string literals in e2e specs', () => {
    const ARABIC_IN_QUOTES = /['"`][^'"`]*[\u0600-\u06FF][^'"`]*['"`]/;
    const offences: string[] = [];

    for (const file of walk('tests/e2e', ['.ts'])) {
      if (file.endsWith('fixtures.ts')) continue;

      for (const { line, text } of readCode(file)) {
        if (ARABIC_IN_QUOTES.test(text)) {
          offences.push(`${file}:${line} → ${text.trim().slice(0, 90)}`);
        }
      }
    }

    expect(
      offences,
      "Read the label from messages/ar.json with t('namespace.key') from " +
        'tests/e2e/fixtures.ts instead of writing the Arabic into the test.',
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
  it.each(['server/queries', 'server/services', 'server/auth'])(
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

describe('the server-only stub stays in the tests', () => {
  /**
   * tests/integration stubs out `server-only` so a service can be imported by
   * a test. That stub is harmless there and catastrophic anywhere else: it
   * would silently disable the guard that stops database code being bundled
   * into the browser.
   */
  it('is not referenced by application code or the app build config', () => {
    const scope = [
      ...uiFiles,
      ...walk('server', ['.ts']),
      ...walk('lib', ['.ts']),
      ...walk('schemas', ['.ts']),
      ...walk('config', ['.ts']),
    ];

    const offences = scope.filter((file) =>
      readFileSync(join(ROOT, file), 'utf8').includes('server-only-stub'),
    );

    // vitest.config.mts runs the unit tests and must NOT alias server-only:
    // that alias belongs to the integration config alone. The check is for an
    // actual alias entry, not any mention — an earlier version matched the
    // substring and failed on the comment explaining the rule.
    const unitConfig = readFileSync(join(ROOT, 'vitest.config.mts'), 'utf8');
    if (/['"]server-only['"]\s*:/.test(unitConfig)) {
      offences.push('vitest.config.mts aliases server-only');
    }
    if (unitConfig.includes('server-only-stub')) {
      offences.push('vitest.config.mts points at the stub');
    }

    expect(
      offences,
      'The stub exists only for tests/integration. Anywhere else it disables ' +
        'the guard that keeps server code out of the browser bundle.',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('the auth provider stays swappable', () => {
  /**
   * CLAUDE.md §7: application code never imports better-auth directly, so the
   * provider can be replaced without touching feature code. There are exactly
   * two seams — the server instance and the browser client — and this keeps it
   * that way. Without the test the rule survives until the first component
   * that wants one convenient hook.
   */
  const SEAMS = [
    'server/auth/auth.ts',
    'features/auth/auth-client.ts',
    // The seed writes a credential row so the demo admin can sign in, and it
    // uses the provider's own hasher rather than inventing one. It is a script,
    // not application code — eslint.config.mjs exempts server/db/** for the
    // same reason.
    'server/db/seed.ts',
  ];

  it('is imported only by its two seam modules', () => {
    const scope = [
      ...uiFiles,
      ...walk('server', ['.ts']),
      ...walk('lib', ['.ts']),
      ...walk('schemas', ['.ts']),
      ...walk('config', ['.ts']),
    ];

    const offences: string[] = [];
    for (const file of scope) {
      if (SEAMS.includes(file.split('\\').join('/'))) continue;
      for (const { line, text } of readCode(file)) {
        if (/from ['"]better-auth/.test(text)) {
          offences.push(`${file}:${line} → ${text.trim()}`);
        }
      }
    }

    expect(
      offences,
      'Import from @/server/auth/auth or @/features/auth/auth-client instead. ' +
        'Those two files are the only ones that may know which provider MPS uses.',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('admin data is guarded', () => {
  /**
   * CLAUDE.md §7: middleware protects the route, the guard protects the data.
   * The admin layout's redirect is a courtesy — a Server Action can be invoked
   * directly with no layout involved, so every admin read and write must call
   * a guard itself.
   *
   * This is checked statically because the failure mode is silent: a new admin
   * function that forgets the guard works perfectly for staff, and exposes
   * customer phone numbers and addresses to anyone who finds the action id.
   */
  const ADMIN_MODULES = [
    ...walk('server/services', ['.ts']),
    ...walk('server/queries', ['.ts']),
  ].filter((file) => /admin/i.test(file));

  it('has admin modules to check', () => {
    // Guards against the test quietly passing because the glob stopped
    // matching anything after a rename.
    expect(ADMIN_MODULES.length).toBeGreaterThan(0);
  });

  it.each(ADMIN_MODULES)('every exported function in %s calls a guard', (file) => {
    const source = readFileSync(join(ROOT, file), 'utf8');

    // Split on exported async functions and check each body for a guard call.
    const functions = [
      ...source.matchAll(/export async function (\w+)[\s\S]*?(?=\nexport |\n?$)/g),
    ];

    const unguarded = functions
      .filter(([body]) => !/require(Staff|Admin|User|Role)\s*\(/.test(body))
      .map(([, name]) => `${file}:${name}`);

    expect(
      unguarded,
      'Call requireStaff() or requireAdmin() at the top. The admin layout does ' +
        'not protect a Server Action invoked directly.',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('conditional classes go through cn()', () => {
  /**
   * A template-literal className puts every class in the attribute and lets
   * CSS source order decide which wins. That is invisible in review and
   * silent at runtime: `hidden sm:inline-flex` appended after a base string
   * containing `inline-flex` hid nothing at all, so the phone header carried
   * thirteen controls and customers tapped the language switch while aiming
   * for their account.
   *
   * cn() runs tailwind-merge, which knows the two are the same display group
   * and keeps the later one. Only display conflicts are checked here — a
   * colour or alignment toggle in a template literal is harmless.
   */
  const DISPLAY = /\b(?:inline-flex|inline-block|block|flex|grid|contents|inline)\b/;

  it('never mixes a display utility with `hidden` in a template literal', () => {
    const offences: string[] = [];

    for (const file of uiFiles.filter((f) => f.endsWith('.tsx'))) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      // Each className={`...`} template, backtick to backtick.
      for (const match of source.matchAll(/className=\{`([\s\S]*?)`\}/g)) {
        const body = match[1] ?? '';
        if (/\bhidden\b/.test(body) && DISPLAY.test(body)) {
          const line = source.slice(0, match.index).split('\n').length;
          offences.push(`${file}:${line}`);
        }
      }
    }

    expect(
      offences,
      'Use cn() so tailwind-merge resolves the conflict. In a plain string the ' +
        'CSS source order decides, not the order you wrote them in.',
    ).toEqual([]);
  });
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

// ---------------------------------------------------------------------------

describe('one main landmark per page', () => {
  /**
   * The storefront layout renders `<main id="main">` around every page, and
   * the skip link points at that id. A page that renders its own `<main>`
   * nests one inside the other: invalid HTML, and a screen reader offers two
   * "main" landmarks where there is one page.
   *
   * Four pages did — cart, checkout, order detail and tracking — and nothing
   * caught it, because it looks completely ordinary in review and renders
   * fine. Found by reading the DOM of the built site.
   *
   * Auth pages are exempt: their layout deliberately has no chrome, so the
   * page itself is the landmark.
   */
  it('no storefront page renders its own <main>', () => {
    const offences: string[] = [];

    for (const file of walk('app/[locale]/(storefront)', ['.tsx'])) {
      if (file.endsWith('layout.tsx')) continue;
      const source = readFileSync(join(ROOT, file), 'utf8');
      const line = source.split('\n').findIndex((l) => /<main[\s>]/.test(l));
      if (line !== -1) offences.push(`${relative('.', file)}:${line + 1}`);
    }

    expect(
      offences,
      'The (storefront) layout already provides <main id="main">. Use a <div> ' +
        'here — a nested landmark is invalid HTML and confuses screen readers.',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('cookies decide `secure` from the URL, not NODE_ENV', () => {
  /**
   * CLAUDE.md §7 records this for the session cookie, and the three cookies
   * MPS sets itself each carried the broken version anyway — so the rule was
   * written down, fixed in one place, and silently violated in three others.
   *
   * `pnpm start` sets NODE_ENV=production. On http://localhost that marks the
   * cookie `Secure`, and browsers refuse to store a Secure cookie over http.
   * Nothing errors: the cart token is re-minted on every click so the cart is
   * always empty, and `mps.recent_order` never sticks so a guest cannot open
   * the confirmation page for the order they just placed. curl stores them
   * regardless, which is why the API looks healthy while every browser is not.
   *
   * Everything goes through `appCookieOptions()` now, and this keeps it there.
   */
  it('no cookie sets secure from NODE_ENV', () => {
    const offences: string[] = [];

    for (const file of [
      ...walk('server', ['.ts']),
      ...walk('features', ['.ts', '.tsx']),
      ...walk('app', ['.ts', '.tsx']),
    ]) {
      // readCode strips comments, so the rule quoted in this file's own
      // explanation above is not a false hit.
      for (const { line, text } of readCode(file)) {
        if (/secure\s*:\s*process\.env\.NODE_ENV/.test(text)) {
          offences.push(`${relative('.', file)}:${line}`);
        }
      }
    }

    expect(
      offences,
      'Use appCookieOptions() from server/cookies.ts. `secure` follows ' +
        "BETTER_AUTH_URL's scheme — NODE_ENV is production under `pnpm start` " +
        'on http://localhost, where a Secure cookie is silently discarded.',
    ).toEqual([]);
  });
});
