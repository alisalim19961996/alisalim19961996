import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Integration tests: real Postgres, real transactions, real CHECK constraints.
 *
 * Unit tests cover `lib/`, which is framework-free by design. But order
 * placement is the one path where being wrong costs money, and the things that
 * make it correct — a transaction, a conditional UPDATE that two checkouts
 * race against, a constraint the database enforces — cannot be tested with a
 * fake. They need the database.
 *
 * A separate config rather than a second `include` because of the alias below:
 * `server-only` throws when imported outside a Server Component, which is the
 * whole point of the marker in the app. Stubbing it HERE, in a config that
 * never touches the app build, lets a test import a service without weakening
 * that guarantee anywhere it matters.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // These share one database, so they must not run against each other.
    fileParallelism: false,
    // A transaction contending on a row lock is slower than a pure function.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL('./tests/integration/server-only-stub.ts', import.meta.url),
      ),
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
