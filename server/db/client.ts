import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { serverEnv } from '@/config/env';
import { diagnoseDatabaseError } from './diagnose';

/**
 * Prisma 7 connects through a driver adapter rather than a URL in the schema.
 *
 * In development Next.js hot-reloads modules on every edit; without caching the
 * instance on globalThis each reload would open a new connection pool and
 * exhaust Postgres within a few minutes.
 */
const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: serverEnv.DATABASE_URL }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  }).$extends({
    query: {
      // Every model, every operation. A database that is down, un-migrated or
      // behind a wrong password otherwise surfaces as a stack trace pointing at
      // whichever query happened to run first — on the homepage, that is
      // `product.findMany()`, which says nothing about the real problem.
      //
      // Only setup failures are rewritten; ordinary query errors pass through
      // unchanged, because services identify them by `instanceof` and `code`.
      async $allOperations({ query, args }) {
        try {
          return await query(args);
        } catch (error) {
          throw diagnoseDatabaseError(error);
        }
      },
    },
  });

type PrismaClientSingleton = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

/**
 * The transaction client, derived from `db` rather than from
 * `Prisma.TransactionClient`.
 *
 * `$extends` produces a distinct client type, so the stock `TransactionClient`
 * no longer describes what `db.$transaction` hands a callback. Deriving it here
 * keeps the two in step: change the extensions above and every service that
 * takes a transaction follows automatically.
 */
export type DbTransaction = Omit<
  typeof db,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;
