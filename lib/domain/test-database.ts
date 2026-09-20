/**
 * Is this database one an integration test may write to?
 *
 * The integration suites create rows, mutate rows they did not create, and
 * `deleteMany` their way out again — §17 already records the run that left the
 * dev database with zero active admins. All of that is fine against a throwaway
 * database and catastrophic against a real one, and the only thing standing
 * between them today is whichever `DATABASE_URL` happens to be exported.
 *
 * So the name has to say it is disposable. A database called `mps_dev`,
 * `mps_test` or `mps_ci` is; one called `mps` or `mps_production` is not, and
 * neither is a managed host, which is the case that actually costs something —
 * a pooler URL pasted in to debug a production issue would otherwise be
 * emptied by the next `pnpm test:integration`.
 *
 * `MPS_ALLOW_INTEGRATION_DB=1` overrides it, because a rule with no way out is
 * one somebody deletes instead of satisfying. It has to be typed deliberately.
 */

/** Suffixes that mean "this database exists to be thrown away". */
const DISPOSABLE = /(^|[_-])(dev|test|testing|ci|e2e|local|shadow)$/i;

/** Hosts where a database is somebody's actual machine. */
const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'postgres',
  'db',
]);

export type DatabaseVerdict = { allowed: true } | { allowed: false; reason: string };

export function isDisposableDatabase(rawUrl: string | undefined): DatabaseVerdict {
  if (!rawUrl) {
    return { allowed: false, reason: 'DATABASE_URL is not set.' };
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'DATABASE_URL is not a URL.' };
  }

  const name = url.pathname.replace(/^\//, '');
  if (!name) {
    return { allowed: false, reason: 'DATABASE_URL names no database.' };
  }

  // A disposable NAME is the primary signal, and it is enough on its own: CI
  // runs against a service container whose host is not localhost.
  if (DISPOSABLE.test(name)) return { allowed: true };

  if (LOCAL_HOSTS.has(url.hostname)) {
    return {
      allowed: false,
      reason:
        `The database "${name}" is on this machine but is not named as ` +
        'disposable. Rename it (…_dev, …_test) or set MPS_ALLOW_INTEGRATION_DB=1.',
    };
  }

  return {
    allowed: false,
    reason:
      `Refusing to run integration tests against "${name}" on ${url.hostname}. ` +
      'These suites create, mutate and delete rows. Point DATABASE_URL at a ' +
      'disposable database, or set MPS_ALLOW_INTEGRATION_DB=1 if you are sure.',
  };
}
