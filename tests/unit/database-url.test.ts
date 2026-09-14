import { describe, expect, it } from 'vitest';
import {
  isPlaceholderDatabaseUrl,
  isPooledDatabaseUrl,
  poolerCeiling,
  poolingPlanFor,
} from '@/lib/database-url';

/**
 * The failure this prevents: `.env.example` is copied to `.env` and never
 * filled in. The app boots, and the first query answers
 * `Authentication failed ... for \`user\`` — naming the database rather than
 * the file that is wrong.
 */
describe('isPlaceholderDatabaseUrl', () => {
  it('recognises the template shipped in .env.example', () => {
    expect(
      isPlaceholderDatabaseUrl(
        'postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public',
      ),
    ).toBe(true);
  });

  it.each([
    ['postgresql://USER:realpw@127.0.0.1:5432/mps_dev', 'username left as USER'],
    ['postgresql://mps:PASSWORD@127.0.0.1:5432/mps_dev', 'password left'],
    ['postgresql://mps:pw@HOST:5432/mps_dev', 'host left'],
    ['postgresql://mps:pw@127.0.0.1:5432/DATABASE?schema=public', 'database left'],
  ])('catches a partly-filled template (%s)', (url) => {
    expect(isPlaceholderDatabaseUrl(url)).toBe(true);
  });

  it.each([
    'postgresql://mps:mps_dev_password@127.0.0.1:5432/mps_dev?schema=public',
    'postgresql://postgres.abcdef:s3cret@aws-0.pooler.supabase.com:5432/postgres',
    'postgres://neondb_owner:npg_xyz@ep-cool.eu-central-1.aws.neon.tech/neondb',
  ])('accepts a real connection string', (url) => {
    expect(isPlaceholderDatabaseUrl(url)).toBe(false);
  });

  it('does not refuse a deployment whose role really is called "user"', () => {
    // Matched in position, not as a bare word: `://USER:` is the template,
    // `://user:` with a real password is somebody's actual database.
    expect(
      isPlaceholderDatabaseUrl('postgresql://user:s3cret@127.0.0.1:5432/shop'),
    ).toBe(false);
  });

  it('does not refuse a database legitimately named after a host word', () => {
    expect(
      isPlaceholderDatabaseUrl('postgresql://mps:pw@db.internal:5432/hostdb'),
    ).toBe(false);
  });
});

describe('recognising a pooled connection', () => {
  /*
    The build opens one Prisma client per worker — 23 on the owner's machine —
    and Supabase's session pooler allows 15 clients for the whole project. The
    build died partway through prerendering, blaming a page that was fine.
  */
  it.each([
    'postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
    'postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
    'postgresql://u:p@db.example.com:5432/app?pgbouncer=true',
    'postgresql://u:p@db.example.com:5432/app?sslmode=require&pgbouncer=true',
    'postgresql://u:p@db.example.com:6543/app',
  ])('treats %s as pooled', (url) => {
    expect(isPooledDatabaseUrl(url)).toBe(true);
  });

  it.each([
    'postgresql://mps:pw@127.0.0.1:5432/mps_dev?schema=public',
    'postgresql://u:p@db.abcdefg.supabase.co:5432/postgres',
    'postgresql://u:p@10.0.0.4:5432/app',
  ])('treats %s as direct', (url) => {
    expect(isPooledDatabaseUrl(url)).toBe(false);
  });

  it('caps build workers only against a pooler', () => {
    // undefined means "let Next use the machine", which is right for a local
    // Postgres that allows a hundred clients — and for CI.
    expect(
      poolingPlanFor('postgresql://mps:pw@127.0.0.1:5432/mps_dev').buildWorkers,
    ).toBeUndefined();
    expect(
      poolingPlanFor('postgresql://u:p@aws-0.pooler.supabase.com:5432/postgres')
        .buildWorkers,
    ).toBe(4);
  });

  it('plans a build that actually fits under the pooler ceiling', () => {
    /*
      The assertion that matters, and the one whose absence caused the bug:
      only the PRODUCT is the constraint. Four workers holding a pool of five
      each is twenty connections against a ceiling of fifteen — which looks
      careful on each line and fails as a pair.
    */
    const plan = poolingPlanFor('postgresql://u:p@aws-0.pooler.supabase.com:5432/db');
    expect((plan.buildWorkers ?? 1) * plan.poolMax).toBeLessThan(poolerCeiling);
  });

  it('leaves headroom for a dev server or Studio open alongside', () => {
    const plan = poolingPlanFor('postgresql://u:p@aws-0.pooler.supabase.com:5432/db');
    const used = (plan.buildWorkers ?? 1) * plan.poolMax;
    expect(poolerCeiling - used).toBeGreaterThanOrEqual(3);
  });

  it('does not cap when there is no connection string to read', () => {
    expect(poolingPlanFor(undefined).buildWorkers).toBeUndefined();
  });
});
