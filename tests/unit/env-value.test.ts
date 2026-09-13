import { describe, expect, it } from 'vitest';
import { blankToUndefined } from '@/lib/env-value';

/**
 * The regression this guards is a site-down bug: an optional variable left as
 * `""` in .env — which is how .env.example ships all of them — made the schema
 * reject it, and `config/env.ts` throws at import time, so every page 500'd
 * with an error about a feature that was never configured.
 */
describe('blankToUndefined', () => {
  it('treats an empty string as not set', () => {
    expect(blankToUndefined('')).toBeUndefined();
  });

  it('treats whitespace as not set', () => {
    // A trailing space after `=` is invisible in an editor.
    expect(blankToUndefined('   ')).toBeUndefined();
    expect(blankToUndefined('\t\n')).toBeUndefined();
  });

  it('keeps a real value untouched, including its own spacing', () => {
    expect(blankToUndefined('sb_secret_abc')).toBe('sb_secret_abc');
    // Only *entirely* blank values are dropped; trimming a real value could
    // silently change a secret.
    expect(blankToUndefined('  padded  ')).toBe('  padded  ');
  });

  it('passes through anything that is not a string', () => {
    expect(blankToUndefined(undefined)).toBeUndefined();
    expect(blankToUndefined(null)).toBeNull();
    expect(blankToUndefined(0)).toBe(0);
    expect(blankToUndefined(false)).toBe(false);
  });
});
