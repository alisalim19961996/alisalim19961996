import { describe, expect, it } from 'vitest';
import { isPlaceholderDatabaseUrl } from '@/lib/database-url';

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
