/**
 * Reading and writing .env, in one place.
 *
 * Both `pnpm setup` and `pnpm keys` edit this file, and a second copy of
 * "replace the line if it exists, append it if it does not" is how one of them
 * ends up appending a duplicate the other never reads (CLAUDE.md §16).
 *
 * That warning was already here and was ignored: `check-services.mjs` carried
 * its own parser, and that copy — not this one — is what told the owner their
 * .env was empty when every value was in it. Everything that reads or writes
 * the file goes through this module.
 *
 * ## Windows line endings are the whole difficulty
 *
 * The owner is on Windows, so `.env` arrives with CRLF, and JavaScript treats
 * a lone `\r` as a line terminator. Two consequences, both of which shipped:
 *
 *   - `.` does NOT match `\r`, so `/^(KEY)=(.*)$/` fails on EVERY line of a
 *     CRLF file. A parser written that way reports a perfectly good file as
 *     having no variables at all.
 *   - `^` and `$` with the `m` flag match around `\r` as well as `\n`, so in
 *     `A="1"\r\nB="2"`, `^` matches at the `\n` — and a leading `\s*` then
 *     eats that newline, gluing B onto A's line when B is rewritten. Two
 *     variables become one unreadable line per write.
 *
 * So: newlines are split off explicitly before anything looks at a line, and
 * the writer never lets a pattern touch a line boundary.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const ENV_PATH = '.env';
export const EXAMPLE_PATH = '.env.example';

/** Split into lines without caring which of the three conventions wrote them. */
const toLines = (text) => text.split(/\r\n|\r|\n/);

/** What this file uses, so a rewrite does not convert it under the owner. */
export const detectEol = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

export function parseEnv(text) {
  const out = {};
  for (const line of toLines(text)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    out[key] = rawValue.replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * Set one variable, replacing the existing line rather than adding a second.
 *
 * Done by rebuilding the lines rather than by a multiline regex: a pattern
 * with `^`/`$` and the `m` flag matches around `\r` too, and that is what
 * merged two variables into one line on the owner's machine.
 *
 * The value is always quoted: a Supabase key can contain characters a shell
 * would otherwise read as syntax, and an unquoted trailing space becomes part
 * of the value in some parsers and not others.
 */
export function writeEnvValue(text, key, value) {
  const eol = detectEol(text);
  const line = `${key}="${value}"`;
  const lines = toLines(text);
  const isKey = (l) => new RegExp(`^\\s*${key}\\s*=`).test(l);

  const index = lines.findIndex(isKey);
  if (index === -1) {
    // Drop the blank tail `split` leaves on a file ending in a newline, so the
    // appended line does not arrive after a gap that grows on every write.
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push(line, '');
    return lines.join(eol);
  }

  // A duplicate of the same key further down would shadow what we just wrote,
  // depending on which parser reads it. Keep the first, drop the rest.
  const deduped = lines.filter((l, i) => i === index || !isKey(l));
  deduped[deduped.indexOf(lines[index])] = line;
  return deduped.join(eol);
}

/**
 * Refuse to save a file that lost a variable.
 *
 * This tool exists so the owner never edits `.env` by hand, which means it is
 * the only thing standing between them and their database URL. It has damaged
 * that file once. A rewrite that drops a key is now a crash, not a save.
 */
export function assertNoKeysLost(before, after) {
  const had = Object.keys(parseEnv(before));
  const has = new Set(Object.keys(parseEnv(after)));
  const lost = had.filter((key) => !has.has(key));
  if (lost.length > 0) {
    throw new Error(
      `Refusing to write .env: it would lose ${lost.join(', ')}. ` +
        'This is a bug in the writer, not in your file — nothing was changed.',
    );
  }
}

export function readEnvFile() {
  if (!existsSync(ENV_PATH)) return null;
  return readFileSync(ENV_PATH, 'utf8');
}

export function saveEnvFile(text) {
  writeFileSync(ENV_PATH, text);
}
