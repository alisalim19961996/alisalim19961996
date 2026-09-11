import type { MetadataRoute } from 'next';
import { publicEnv } from '@/config/env';

export default function robots(): MetadataRoute.Robots {
  const base = publicEnv.NEXT_PUBLIC_APP_URL;

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Admin and checkout have nothing to index and everything to leak.
      // `/api/` is disallowed for crawl budget, not as a security control.
      disallow: ['/api/', '/ar/admin', '/en/admin', '/ar/checkout', '/en/checkout'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
