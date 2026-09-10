import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

/**
 * Next 16 renamed the `middleware` file convention to `proxy`.
 * This resolves the incoming locale and rewrites to the /[locale] tree.
 */
export default createMiddleware(routing);

export const config = {
  // Everything except API routes, Next internals and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
