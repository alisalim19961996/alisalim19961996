import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
