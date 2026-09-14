import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/i18n/navigation';
import { Logo } from '@/components/layout/logo';
import { SignUpForm } from '@/features/auth/components/sign-up-form';
import { GoogleSignInButton } from '@/features/auth/components/google-sign-in-button';
import { isGoogleSignInConfigured } from '@/config/env';
import { getCurrentUser } from '@/server/auth/guards';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('createAccount'), robots: { index: false, follow: false } };
}

/**
 * Create an account.
 *
 * Optional by design: checkout has never required one and still does not.
 * An account buys the customer their order history and a cart that survives
 * changing device — nothing more — so forcing registration at checkout would
 * cost orders to buy nothing.
 */
export default async function SignUpPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('auth');

  // Already signed in: there is nothing to create.
  const user = await getCurrentUser();
  if (user) return redirect({ href: '/account', locale });

  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo />
        </div>

        <h1 className="mt-8 text-center text-xl font-bold text-ink">
          {t('createAccount')}
        </h1>
        <p className="mt-1 text-center text-sm text-muted">{t('signUpHint')}</p>

        <div className="mt-8 rounded-[--radius-panel] border border-border bg-surface p-6">
          <SignUpForm />

          {isGoogleSignInConfigured && (
            <>
              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-subtle">{t('or')}</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <GoogleSignInButton />
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          {t('haveAccount')}{' '}
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            {t('signIn')}
          </Link>
        </p>
      </div>
    </main>
  );
}
