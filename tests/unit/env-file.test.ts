/**
 * The .env editor, tested on Windows line endings.
 *
 * `pnpm keys` and `pnpm setup` are the only things that touch the owner's
 * `.env`, and it is the only copy of their database URL. Two bugs shipped here
 * and both were invisible on Linux, because both are about `\r`:
 *
 *   - A parser ending in `(.*)$` matches nothing on a CRLF file, since
 *     JavaScript's `.` does not match `\r`. `pnpm check:services` carried such
 *     a parser and told the owner their file was empty when every value was
 *     in it — then advised them to re-run setup and overwrite it.
 *   - A writer using `^\s*KEY\s*=.*$` with the `m` flag eats the newline
 *     before the line it replaces, because `^` also matches after `\r`. Two
 *     variables end up on one line and both become unreadable.
 *
 * So every case here runs against LF and CRLF alike.
 */
import { describe, expect, it } from 'vitest';
import {
  assertNoKeysLost,
  detectEol,
  parseEnv,
  writeEnvValue,
} from '../../scripts/lib/env-file.mjs';

const KEYS = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DEMO_ADMIN_PASSWORD',
];

/** The owner's file, in whichever convention their editor saved it. */
const file = (eol: string) =>
  KEYS.map((key) => `${key}="value-for-${key}"`).join(eol) + eol;

describe.each([
  ['LF', '\n'],
  ['CRLF', '\r\n'],
])('%s', (_name, eol) => {
  const text = file(eol);

  it('reads every variable', () => {
    expect(Object.keys(parseEnv(text))).toEqual(KEYS);
  });

  it('reads values without a stray carriage return or quote', () => {
    expect(parseEnv(text).SUPABASE_URL).toBe('value-for-SUPABASE_URL');
  });

  it('keeps every other variable when one is rewritten', () => {
    // The regression: writing the last variable used to glue it onto the line
    // above, losing both.
    for (const key of KEYS) {
      const next = writeEnvValue(text, key, 'CHANGED');
      expect(Object.keys(parseEnv(next))).toEqual(KEYS);
      expect(parseEnv(next)[key]).toBe('CHANGED');
    }
  });

  it('rewrites in place instead of appending a second line', () => {
    const next = writeEnvValue(text, 'SUPABASE_URL', 'CHANGED');
    expect(next.match(/SUPABASE_URL\s*=/g)).toHaveLength(1);
  });

  it('appends a variable the file does not have', () => {
    const next = writeEnvValue(text, 'GOOGLE_CLIENT_ID', 'abc');
    expect(parseEnv(next).GOOGLE_CLIENT_ID).toBe('abc');
    expect(Object.keys(parseEnv(next))).toHaveLength(KEYS.length + 1);
  });

  it('does not convert the file to the other convention', () => {
    expect(detectEol(writeEnvValue(text, 'SUPABASE_URL', 'CHANGED'))).toBe(eol);
  });

  it('survives being written to repeatedly', () => {
    let next = text;
    for (const key of [...KEYS, 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) {
      next = writeEnvValue(next, key, `${key}-v2`);
    }
    expect(Object.keys(parseEnv(next))).toHaveLength(KEYS.length + 2);
    expect(next).not.toMatch(/="[^"]*"\S/); // nothing glued after a value
  });
});

describe('quirks a real file has', () => {
  it('ignores comments and blank lines', () => {
    const text = '# a note\r\n\r\nDATABASE_URL="x"\r\n\r\n# another\r\n';
    expect(parseEnv(text)).toEqual({ DATABASE_URL: 'x' });
  });

  it('does not let a blank line before a variable swallow it', () => {
    const next = writeEnvValue('A="1"\r\n\r\nB="2"\r\n', 'B', 'new');
    expect(parseEnv(next)).toEqual({ A: '1', B: 'new' });
  });

  it('reads an unquoted value', () => {
    expect(parseEnv('DATABASE_URL=postgresql://x\r\n').DATABASE_URL).toBe(
      'postgresql://x',
    );
  });

  it('keeps a value containing = and #', () => {
    const next = writeEnvValue('A="1"\n', 'B', 'p=q#r');
    expect(parseEnv(next).B).toBe('p=q#r');
  });

  it('collapses a duplicated key rather than leaving a shadow', () => {
    const next = writeEnvValue('A="1"\nB="2"\nA="3"\n', 'A', 'new');
    expect(next.match(/^A\s*=/gm)).toHaveLength(1);
    expect(parseEnv(next)).toEqual({ A: 'new', B: '2' });
  });
});

describe('assertNoKeysLost', () => {
  it('passes when nothing is lost', () => {
    expect(() => assertNoKeysLost('A="1"\nB="2"\n', 'A="1"\nB="3"\n')).not.toThrow();
  });

  it('names what would have been lost', () => {
    expect(() => assertNoKeysLost('A="1"\nB="2"\n', 'A="1"\n')).toThrow(/B/);
  });
});

describe('a file the old writer already damaged', () => {
  /*
    The shipped bug glued two variables onto one line separated by a bare
    `\r`, and the owner's file is in that state right now. Splitting on a lone
    `\r` as well as on `\n` means the repaired tools READ that file correctly
    instead of reporting it as empty — so recovery is a rewrite, not a retype.
    That is worth more than the safety net catching it, and it is why this
    case asserts recovery rather than a throw.
  */
  const glued = 'A="1"\rB="2"\r\nC="3"\r\n';

  it('still reads every variable', () => {
    expect(parseEnv(glued)).toEqual({ A: '1', B: '2', C: '3' });
  });

  it('separates them again when any one of them is rewritten', () => {
    const next = writeEnvValue(glued, 'B', 'new');
    expect(parseEnv(next)).toEqual({ A: '1', B: 'new', C: '3' });
    expect(next).not.toMatch(/="[^"]*"\S/);
    expect(() => assertNoKeysLost(glued, next)).not.toThrow();
  });
});
