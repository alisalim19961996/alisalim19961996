import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Logo } from '@/components/layout/logo';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';
import { isMailConfigured } from '@/config/env';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('forgotPassword'), robots: { index: false, follow: false } };
}

/**
 * Forgotten password.
 *
 * With no mail provider configured the form is not rendered at all, and the
 * page says why and what to do instead. The alternative — a form that accepts
 * the address and answers "check your inbox" for a message nobody sent — is
 * the worst of the options: the customer waits, retries, and concludes their
 * account is gone (§7 makes the same call for Google's button).
 */
export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('auth');

  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo />
        </div>

        <h1 className="mt-8 text-center text-xl font-bold text-ink">
          {t('forgotPassword')}
        </h1>
        <p className="mt-1 text-center text-sm text-muted">
          {isMailConfigured ? t('forgotPasswordHint') : t('resetUnavailableHint')}
        </p>

        <div className="mt-8 rounded-panel border border-border bg-surface p-6">
          {isMailConfigured ? (
            <ForgotPasswordForm />
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              {t('resetUnavailable')}
            </p>
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
