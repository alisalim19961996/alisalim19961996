import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests have their own config and their own runner: they need
    // a database and a `server-only` stub, neither of which belongs here.
    // Without this exclusion they are picked up as unit tests and fail on
    // import, because the real `server-only` throws outside a request.
    // End-to-end specs are `*.spec.ts` and so fall outside `include` already;
    // named here as well so a `*.test.ts` added under tests/e2e one day does
    // not get picked up by a runner with no browser and no server.
    exclude: ['tests/integration/**', 'tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
