import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';
import { poolingPlanFor } from './lib/database-url';
import { securityHeaders } from './lib/security-headers';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/**
 * The Supabase project's hostname, or undefined when uploads are not set up.
 *
 * Read with a plain URL parse rather than through `config/env.ts`: this file is
 * evaluated before the app's module graph exists, and a config that throws on
 * a missing optional variable would stop `next build` for a store that never
 * wanted uploads.
 */
const supabaseHost = (() => {
  const url = process.env.SUPABASE_URL;
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    // config/env.ts reports the malformed value properly, with its remedy.
    return undefined;
  }
})();

/**
 * Build workers, capped when the database is behind a pooler.
 *
 * `next build` prerenders with one worker per core — 23 on the owner's machine
 * — and each opens its own Prisma client. Supabase's session pooler allows 15
 * clients in total, so the build died partway through with `max clients
 * reached in session mode`, blaming whichever page happened to be rendering.
 *
 * Left alone for a direct connection: a local Postgres allows a hundred
 * clients and the build should use the machine it is on. CI is unaffected — it
 * runs against a throwaway Postgres, not a pooler.
 */
const { buildWorkers } = poolingPlanFor(process.env.DATABASE_URL);

/*
  An override for a pooler this does not recognise. The three shapes it does
  cover are the ones that exist in practice, but a host that announces itself
  some fourth way would leave the owner with a build that dies and no knob to
  turn.
*/
const workerOverride = Number(process.env.BUILD_WORKERS) || undefined;
const cpus = workerOverride ?? buildWorkers;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(cpus ? { experimental: { cpus } } : {}),
  images: {
    formats: ['image/avif', 'image/webp'],
    // Product photography comes from two places and no others: files under
    // public/, and the Supabase Storage bucket uploads go to. The host is read
    // straight from the environment rather than written out, so there is one
    // place to change it — `config/env.ts` is what validates the value.
    //
    // An empty list is the correct state for a store that has not configured
    // storage: `next/image` then refuses every remote URL, which is exactly
    // what should happen.
    remotePatterns: supabaseHost
      ? [
          {
            protocol: 'https' as const,
            hostname: supabaseHost,
            pathname: '/storage/v1/object/public/**',
          },
        ]
      : [],
  },
  typedRoutes: true,
  async headers() {
    return [
      {
        source: '/:path*',
        // Assembled in lib/security-headers.ts so the policy can be unit
        // tested: a CSP that blocks the product video and one that allows
        // everything look the same in a config file.
        headers: securityHeaders({
          storageHost: supabaseHost,
          // The scheme the site is actually served from, exactly as every
          // cookie decides `secure` (§7). Read at build time, which is when
          // this config is evaluated — a deployment serves one origin.
          secure: (process.env.BETTER_AUTH_URL ?? '').startsWith('https://'),
        }),
      },
    ];
  },
};

export default withNextIntl(nextConfig);
