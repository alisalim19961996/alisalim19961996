import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/i18n/navigation';
import { Logo } from '@/components/layout/logo';
import { SignInForm } from '@/features/auth/components/sign-in-form';
import { GoogleSignInButton } from '@/features/auth/components/google-sign-in-button';
import { isGoogleSignInConfigured } from '@/config/env';
import { getCurrentUser, isStaff } from '@/server/auth/guards';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('signIn'), robots: { index: false, follow: false } };
}

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const [{ locale }, { next, error }] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations('auth');

  // Already signed in: there is nothing to do here. Honour ?next=admin only
  // for someone who can actually open the dashboard — sending a customer there
  // is what created a redirect loop with the admin layout. Everyone else lands
  // in their account, which is where /account sent them from.
  const user = await getCurrentUser();
  if (user) {
    return redirect({
      href: next === 'admin' && isStaff(user) ? '/admin' : '/account',
      locale,
    });
  }

  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo />
        </div>

        <h1 className="mt-8 text-center text-xl font-bold text-ink">{t('signIn')}</h1>
        <p className="mt-1 text-center text-sm text-muted">{t('signInHint')}</p>

        <div className="mt-8 rounded-[--radius-panel] border border-border bg-surface p-6">
          {/*
            `next` is only ever compared against the literal "admin" — never
            used as a redirect target — so a crafted ?next= cannot bounce a
            signed-in user to an attacker's URL.
          */}
          {/*
            An OAuth failure comes back here as ?error=<code> rather than on
            better-auth's own bare error page, so it is explained in the
            customer's language on the page they started from.
          */}
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-[--radius-control] bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              {t(oauthErrorKey(error))}
            </p>
          )}

          <SignInForm redirectTo={next === 'admin' ? 'admin' : undefined} />

          {isGoogleSignInConfigured && (
            <>
              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-subtle">{t('or')}</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <GoogleSignInButton redirectTo={next === 'admin' ? 'admin' : undefined} />
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          {t('noAccount')}{' '}
          <Link href="/sign-up" className="font-medium text-primary hover:underline">
            {t('createAccount')}
          </Link>
        </p>

        <p className="mt-4 text-center text-xs text-muted">{t('guestCheckoutNote')}</p>
      </div>
    </main>
  );
}

/**
 * Translate better-auth's OAuth error code into something a customer can act on.
 *
 * `account_not_linked` is the one that needs its own wording: it means the
 * address already has a password account here that has never been verified,
 * so it is deliberately *not* linked (see server/auth/auth.ts). "Sign-in
 * failed" would send the customer round the same loop; naming the password is
 * the only thing that gets them in.
 */
function oauthErrorKey(code: string): string {
  return code === 'account_not_linked' ? 'googleUseYourPassword' : 'googleFailed';
}
