import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { Logo } from '@/components/layout/logo';
import { SignInForm } from '@/features/auth/components/sign-in-form';
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
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ locale }, { next }] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations('auth');

  // Already signed in: there is nothing to do here. Honour ?next=admin only
  // for someone who can actually open the dashboard — sending a customer there
  // is what created a redirect loop with the admin layout.
  const user = await getCurrentUser();
  if (user) {
    return redirect({
      href: next === 'admin' && isStaff(user) ? '/admin' : '/',
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
          <SignInForm redirectTo={next === 'admin' ? 'admin' : undefined} />
        </div>

        <p className="mt-6 text-center text-xs text-muted">{t('guestCheckoutNote')}</p>
      </div>
    </main>
  );
}
