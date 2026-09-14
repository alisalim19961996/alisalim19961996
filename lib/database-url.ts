/**
 * Recognising a connection string that was never filled in.
 *
 * Copying `.env.example` to `.env` and leaving it as-is is the single most
 * common way a first run fails, and the placeholder passes a "non-empty
 * string" check happily. It then surfaces three layers later as
 * `Authentication failed ... for \`user\``, which names the database rather
 * than the file that is actually wrong.
 *
 * Lives in lib/ rather than config/ so it can be unit-tested: importing
 * config/env.ts runs the whole validation as a side effect.
 */

/**
 * Tokens that only ever appear in the template.
 *
 * Matched in position — `://USER:` rather than merely "USER" — so a real
 * deployment whose role genuinely is called `user` is not refused.
 */
const PLACEHOLDERS: readonly RegExp[] = [
  /:\/\/USER:/,
  /:PASSWORD@/,
  /@HOST[:/]/,
  /\/DATABASE(\?|$)/,
];

/** True when the connection string is still the example from `.env.example`. */
export function isPlaceholderDatabaseUrl(url: string): boolean {
  return PLACEHOLDERS.some((pattern) => pattern.test(url));
}

// ---------------------------------------------------------------------------

/**
 * Whether this connection string goes through a connection pooler.
 *
 * It matters because a pooler has a hard ceiling on *clients*, not just on
 * work: Supabase's session pooler allows 15, and `next build` opens one Prisma
 * client per build worker — 23 of them on an ordinary laptop. The build then
 * dies partway through prerendering with `max clients reached in session
 * mode`, naming a page that is not the problem.
 *
 * That is exactly how this was found, on the owner's machine, the moment five
 * new statically-rendered pages pushed the concurrency past the ceiling.
 *
 * Recognised three ways because Supabase, pgbouncer and the other poolers each
 * announce themselves differently, and a deployment may use any of them.
 */
export function isPooledDatabaseUrl(url: string): boolean {
  return (
    /[?&]pgbouncer=true/i.test(url) ||
    /\.pooler\.supabase\.com/i.test(url) ||
    // Supabase's transaction pooler; the session pooler uses 5432 like a
    // direct connection, which is why the hostname check above exists too.
    /:6543(\/|\?|$)/.test(url)
  );
}

/**
 * How many connections this database will tolerate, and how to spend them.
 *
 * Both numbers come from here because only their PRODUCT matters: `next build`
 * runs `buildWorkers` processes, each holding a pool of `poolMax`, so the
 * ceiling is breached by the pair and not by either alone. Setting one
 * sensibly and the other by feel is how a build asks for twenty connections
 * from a pooler that allows fifteen — which is the bug this exists for.
 *
 * Supabase's session pooler allows **15 clients** for the whole project.
 * 4 × 3 = 12 leaves room for the dashboard, a running dev server, and
 * `pnpm db:studio` — all of which the owner may have open while a build runs.
 *
 * For a direct connection there is no ceiling worth planning around: Postgres
 * allows a hundred clients by default, so the build uses the machine it is on
 * and `buildWorkers` stays undefined. CI is unaffected — it runs against a
 * throwaway Postgres, not a pooler.
 */
export interface PoolingPlan {
  /** `undefined` lets Next use one worker per core. */
  buildWorkers: number | undefined;
  /** Connections per Prisma client. */
  poolMax: number;
}

/** What a pooler allows in total, and what has to fit inside it. */
const POOLER_CLIENT_CEILING = 15;
const POOLED_PLAN: PoolingPlan = { buildWorkers: 4, poolMax: 3 };

/**
 * `pg` defaults to 10 per client, which nothing here ever needed: a request
 * awaits its queries and a build worker renders pages one after another.
 */
const DIRECT_PLAN: PoolingPlan = { buildWorkers: undefined, poolMax: 5 };

export function poolingPlanFor(url: string | undefined): PoolingPlan {
  if (!url) return DIRECT_PLAN;
  return isPooledDatabaseUrl(url) ? POOLED_PLAN : DIRECT_PLAN;
}

/** Exported so a test can assert the plan actually fits, rather than assuming. */
export const poolerCeiling = POOLER_CLIENT_CEILING;
