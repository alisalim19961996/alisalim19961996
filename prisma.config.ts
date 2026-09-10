import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 moved the connection URL out of schema.prisma. Migration and
 * introspection commands read it from here; the runtime client gets it through
 * the pg driver adapter in server/db/client.ts.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'tsx server/db/seed.ts',
  },
});
