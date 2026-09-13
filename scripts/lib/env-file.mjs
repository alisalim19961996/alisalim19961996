/**
 * Reading and writing .env, in one place.
 *
 * Both `pnpm setup` and `pnpm keys` edit this file, and a second copy of
 * "replace the line if it exists, append it if it does not" is how one of them
 * ends up appending a duplicate the other never reads (CLAUDE.md §16).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const ENV_PATH = '.env';
export const EXAMPLE_PATH = '.env.example';

export function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    out[key] = rawValue.replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * Set one variable, replacing the existing line rather than adding a second.
 *
 * The value is always quoted: a Supabase key can contain characters a shell
 * would otherwise read as syntax, and an unquoted trailing space becomes part
 * of the value in some parsers and not others.
 */
export function writeEnvValue(text, key, value) {
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  return pattern.test(text)
    ? text.replace(pattern, line)
    : `${text.trimEnd()}\n${line}\n`;
}

export function readEnvFile() {
  if (!existsSync(ENV_PATH)) return null;
  return readFileSync(ENV_PATH, 'utf8');
}

export function saveEnvFile(text) {
  writeFileSync(ENV_PATH, text);
}
