/**
 * Types for the .env editor.
 *
 * The module itself is `.mjs` because `pnpm setup` and `pnpm keys` run under
 * plain Node, before any build step exists — a fresh clone has to be able to
 * write its `.env` before it can compile anything. Its unit tests are
 * TypeScript, so the contract is declared here rather than silenced with
 * `allowJs` or an `any`.
 */
export declare const ENV_PATH: string;
export declare const EXAMPLE_PATH: string;

/** `'\r\n'` for a file any Windows editor saved, `'\n'` otherwise. */
export declare function detectEol(text: string): '\r\n' | '\n';

/** Every `KEY=value` in the file, unquoted, whatever wrote its newlines. */
export declare function parseEnv(text: string): Record<string, string>;

/** The file with `key` set to `value`, replacing its line or appending one. */
export declare function writeEnvValue(text: string, key: string, value: string): string;

/** Throws, naming them, if the rewrite would drop variables the file had. */
export declare function assertNoKeysLost(before: string, after: string): void;

/** The file's contents, or `null` when there is no `.env` yet. */
export declare function readEnvFile(): string | null;

export declare function saveEnvFile(text: string): void;
