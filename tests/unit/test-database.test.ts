import { describe, expect, it } from 'vitest';
import { isDisposableDatabase } from '@/lib/domain/test-database';

/**
 * The integration suites create, mutate and delete rows — §17 records the run
 * that left the dev database with zero active admins. A `DATABASE_URL` left
 * pointing at something real turns that into data loss with no warning.
 */
describe('which database an integration run may write to', () => {
  const allowed = [
    'postgresql://u:p@127.0.0.1:5432/mps_dev',
    'postgresql://u:p@127.0.0.1:5432/mps_test',
    'postgresql://u:p@postgres:5432/mps_ci',
    // CI's service container is not on localhost, so the NAME has to carry it.
    'postgresql://u:p@10.1.2.3:5432/mps_e2e',
  ];

  const refused = [
    // The case that actually costs something: a pooler URL pasted in to debug.
    'postgresql://u:p@db.abcdef.supabase.co:5432/postgres',
    'postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/mps',
    'postgresql://u:p@127.0.0.1:5432/mps',
    'postgresql://u:p@127.0.0.1:5432/mps_production',
  ];

  it.each(allowed)('allows %s', (url) => {
    expect(isDisposableDatabase(url).allowed).toBe(true);
  });

  it.each(refused)('refuses %s', (url) => {
    const verdict = isDisposableDatabase(url);
    expect(verdict.allowed).toBe(false);
    // The message has to say what to do, or it is an obstacle rather than a guard.
    if (!verdict.allowed) expect(verdict.reason).toMatch(/MPS_ALLOW_INTEGRATION_DB/);
  });

  it('refuses a missing or unparseable URL rather than assuming', () => {
    expect(isDisposableDatabase(undefined).allowed).toBe(false);
    expect(isDisposableDatabase('').allowed).toBe(false);
    expect(isDisposableDatabase('not a url').allowed).toBe(false);
    expect(isDisposableDatabase('postgresql://u:p@127.0.0.1:5432/').allowed).toBe(
      false,
    );
  });
});
