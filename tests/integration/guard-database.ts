import 'dotenv/config';
import { isDisposableDatabase } from '../../lib/domain/test-database';

/**
 * Runs once before any integration suite, from `vitest.integration.config.mts`.
 *
 * The suites create rows, mutate rows they did not create, and delete their way
 * out — §17 records the run that left the dev database with zero active admins.
 * A `DATABASE_URL` left pointing at something real turns that into data loss
 * with no warning, so the refusal happens before the first connection.
 */
export function setup(): void {
  if (process.env.MPS_ALLOW_INTEGRATION_DB === '1') return;

  const verdict = isDisposableDatabase(process.env.DATABASE_URL);
  if (!verdict.allowed) {
    throw new Error(`[integration] ${verdict.reason}`);
  }
}
