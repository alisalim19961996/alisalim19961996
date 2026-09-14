import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Logo } from '@/components/layout/logo';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('chooseNewPassword'), robots: { index: false, follow: false } };
}

/**
 * Where the emailed link lands.
 *
 * better-auth validates the token itself when the new password is submitted,
 * so this page does not check it first: a "valid" message followed by a
 * failure on submit is worse than one clear answer at the end, and checking
 * here would need a second endpoint that confirms whether a token is real.
 *
 * With no token at all — someone opening the URL directly — there is nothing
 * to submit, so the page sends them back to ask for a link instead of
 * rendering a form that cannot work.
 */
export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const [{ locale }, { token, error }] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations('auth');
  // better-auth redirects here with ?error=INVALID_TOKEN when the link has
  // already been used or has expired, which is the common case by far.
  const unusable = !token || Boolean(error);

  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo />
        </div>

        <h1 className="mt-8 text-center text-xl font-bold text-ink">
          {t('chooseNewPassword')}
        </h1>

        <div className="mt-8 rounded-[--radius-panel] border border-border bg-surface p-6">
          {unusable ? (
            <div className="space-y-4 text-center">
              <p className="text-sm leading-relaxed text-ink">
                {t('resetTokenInvalid')}
              </p>
              <Link
                href="/forgot-password"
                className="inline-flex text-sm font-medium text-primary hover:underline"
              >
                {t('requestAnotherLink')}
              </Link>
            </div>
          ) : (
            <ResetPasswordForm token={token} />
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            {t('backToSignIn')}
          </Link>
        </p>
      </div>
    </main>
  );
}
