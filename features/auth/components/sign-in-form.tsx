'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/navigation';
import { loginSchema } from '@/schemas/auth';
import { signIn } from '../auth-client';
import { claimCartAfterSignInAction } from '../actions';

/**
 * Sign-in.
 *
 * Submitted from the browser rather than through a Server Action, because
 * better-auth applies its rate limits only to requests that pass through its
 * HTTP handler — see server/auth/auth.ts. A Server Action calling the API
 * directly would leave "5 sign-ins per minute" documented but unenforced.
 *
 * The trade-off is that this component posts credentials itself, so it is
 * careful never to keep the password in state longer than the submit, and
 * never to report *which* half of the pair was wrong.
 */
export function SignInForm({ redirectTo }: { redirectTo?: string }) {
  const t = useTranslations('auth');
  const tValidation = useTranslations('validation');
  const router = useRouter();

  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorKey(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    startTransition(async () => {
      const { error } = await signIn.email({
        email: parsed.data.email,
        password: parsed.data.password,
      });

      if (error) {
        // A 403 here is not a bad password: it is better-auth's origin check
        // refusing because BETTER_AUTH_URL does not match the origin the site
        // is actually served from. Every sign-in fails when that is
        // misconfigured, and "wrong password" would send whoever is debugging
        // it looking in entirely the wrong place — so say so in the console,
        // where a developer will see it and a customer will not.
        if (error.status === 403 && process.env.NODE_ENV !== 'production') {
          console.error(
            '[auth] 403 from sign-in. BETTER_AUTH_URL must match the origin ' +
              'this site is served from — check .env against the current port.',
          );
        }

        // The customer gets one message for every failure. Distinguishing "no
        // such account" from "wrong password" tells an attacker which
        // addresses are real, and a 429 from the rate limiter should not read
        // as a hint that the password was close.
        setErrorKey(error.status === 429 ? 'tooManyAttempts' : 'invalidCredentials');
        return;
      }

      // The visitor may have filled a cart before signing in; fold it into the
      // account's cart now rather than waiting for their next cart action.
      await claimCartAfterSignInAction();

      router.replace(redirectTo === 'admin' ? '/admin' : '/');
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-ink">
          {t('email')}
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          dir="ltr"
          aria-invalid={Boolean(fieldErrors.email)}
        />
        {fieldErrors.email && (
          <p role="alert" className="text-xs text-danger">
            {tValidation(fieldErrors.email)}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          {t('password')}
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          dir="ltr"
          aria-invalid={Boolean(fieldErrors.password)}
        />
        {fieldErrors.password && (
          <p role="alert" className="text-xs text-danger">
            {tValidation(fieldErrors.password)}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <LogIn aria-hidden />
        )}
        {pending ? t('signingIn') : t('signIn')}
      </Button>

      {errorKey && (
        <p role="alert" className="text-center text-sm text-danger">
          {t(errorKey)}
        </p>
      )}
    </form>
  );
}
