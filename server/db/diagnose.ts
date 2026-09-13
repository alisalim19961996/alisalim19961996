/**
 * Turning a Prisma error into something the owner can act on.
 *
 * `config/env.ts` already refuses to boot without naming the fix for each
 * missing variable. This is the same idea one layer down: the environment can
 * be perfectly configured and the database still be unreachable, un-migrated,
 * or behind a wrong password — and by default that surfaces on the homepage as
 * a stack trace pointing at `product.findMany()`, which says nothing about the
 * thing that is actually wrong.
 *
 * Only setup-shaped failures are rewritten. Ordinary query errors — a unique
 * constraint, a missing row — are the application's business and pass through
 * untouched, which matters because `server/services/order.ts` catches P2002 by
 * identity to retry an order number.
 */

/** Prisma codes that mean "the database is not set up", not "this query is wrong". */
const SETUP_FAILURES: Record<string, { cause: string; fix: string }> = {
  P1000: {
    cause: 'PostgreSQL refused the username or password.',
    fix: 'Check the credentials in DATABASE_URL inside .env against the ones the server actually has.',
  },
  P1001: {
    cause: 'PostgreSQL is not reachable at the host and port in DATABASE_URL.',
    fix:
      'Start it, then reload:\n' +
      '      Docker:   docker compose up -d\n' +
      '      Windows:  services.msc → postgresql-x64-16 → Start\n' +
      '      Linux:    sudo service postgresql start\n' +
      '    If it IS running, check the port in DATABASE_URL.',
  },
  P1002: {
    cause: 'PostgreSQL accepted the connection but timed out.',
    fix: 'The server is starting or overloaded. Wait a moment and reload.',
  },
  P1003: {
    cause: 'The database named in DATABASE_URL does not exist.',
    fix: 'Run `pnpm setup` to create it, or create it by hand and run `pnpm db:deploy`.',
  },
  P1017: {
    cause: 'PostgreSQL closed the connection.',
    fix: 'Usually the server restarted. Reload; if it repeats, check the PostgreSQL log.',
  },
  P2021: {
    cause: 'The database is reachable but a table is missing.',
    fix: 'Migrations have not been applied: run `pnpm db:deploy`, then `pnpm db:seed` for demo data.',
  },
  P2022: {
    cause: 'The database is reachable but a column is missing.',
    fix: 'The schema has moved ahead of the database: run `pnpm db:migrate` in development, `pnpm db:deploy` in production.',
  },
};

export class DatabaseSetupError extends Error {
  constructor(
    readonly code: string,
    cause: string,
    fix: string,
    originalError: unknown,
  ) {
    super(
      [
        '',
        `Database not ready (${code}).`,
        '',
        `  What happened: ${cause}`,
        `  How to fix it: ${fix}`,
        '',
        '  Check the connection with:  pnpm db:studio',
        '',
      ].join('\n'),
      { cause: originalError },
    );
    this.name = 'DatabaseSetupError';
  }
}

function codeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/**
 * Rewrite a setup failure, or hand the error back exactly as it arrived.
 *
 * Returning the original object rather than a copy is deliberate: callers
 * identify Prisma errors with `instanceof` and by `code`, and a well-meaning
 * wrapper around every error would break them silently.
 */
export function diagnoseDatabaseError(error: unknown): unknown {
  const code = codeOf(error);
  if (!code) return error;

  const failure = SETUP_FAILURES[code];
  if (!failure) return error;

  return new DatabaseSetupError(code, failure.cause, failure.fix, error);
}

/**
 * The name of the unique constraint a P2002 violated.
 *
 * Prisma reports this in two different shapes, and which one you get depends
 * on how the client connects. The classic engine fills `meta.target` with the
 * columns; the **pg driver adapter this project uses** leaves `target`
 * undefined and reports the constraint it violated under
 * `meta.driverAdapterError.cause.constraint` instead.
 *
 * Reading only `target` therefore works in a unit test and fails against the
 * real database — silently, by falling through to "something went wrong" on
 * the one error the caller most wants to name. Both shapes are read here, in
 * the one module that is allowed to know what a Prisma error looks like.
 */
export function uniqueConstraintName(error: unknown): string | null {
  if (codeOf(error) !== 'P2002') return null;

  const meta = (error as { meta?: unknown }).meta;
  if (!isRecord(meta)) return null;

  const parts: string[] = [];

  const target = meta['target'];
  if (Array.isArray(target)) parts.push(...target.map(String));
  else if (typeof target === 'string') parts.push(target);

  const adapterError = meta['driverAdapterError'];
  const cause = isRecord(adapterError) ? adapterError['cause'] : undefined;
  const constraint = isRecord(cause) ? cause['constraint'] : undefined;
  if (isRecord(constraint)) {
    const index = constraint['index'];
    if (typeof index === 'string') parts.push(index);
    const fields = constraint['fields'];
    if (Array.isArray(fields)) parts.push(...fields.map(String));
  }

  return parts.length === 0 ? null : parts.join(',');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
