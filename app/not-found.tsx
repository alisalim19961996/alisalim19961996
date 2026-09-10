import { redirect } from 'next/navigation';
import { defaultLocale } from '@/i18n/routing';

/**
 * A request that never matched the locale middleware (a malformed URL) has no
 * locale context, so send it to the default locale's 404 rather than render an
 * unstyled, direction-less page.
 */
export default function RootNotFound() {
  redirect(`/${defaultLocale}`);
}
