'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Loader2, MailCheck, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { forgotPasswordSchema } from '@/schemas/auth';
import { requestPasswordReset } from '../auth-client';

/**
 * Ask for a reset link.
 *
 * The success message is shown for **every** submission that is not rate
 * limited, including an address with no account. Saying "no such account" here
 * would turn the form into a way to discover which addresses are registered —
 * the same reasoning as the single sign-in error and the tracking form (§12).
 * better-auth's own endpoint answers identically for that reason.
 */
export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const tValidation = useTranslations('validation');
  const locale = useLocale();

  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  if (sent) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto size-8 text-success" aria-hidden />
        <p className="mt-3 text-sm leading-relaxed text-ink">{t('resetSent')}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">{t('resetSentHint')}</p>
      </div>
    );
  }

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldError(null);
    setErrorKey(null);

    const parsed = forgotPasswordSchema.safeParse({
      email: new FormData(event.currentTarget).get('email'),
    });

    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'invalidEmail');
      return;
    }

    startTransition(async () => {
      const { error } = await requestPasswordReset({
        email: parsed.data.email,
        // Where the link lands. better-auth appends its own token route and
        // sends the customer here afterwards, in the language they asked in.
        redirectTo: `/${locale}/reset-password`,
      });

      if (error) {
        setErrorKey(error.status === 429 ? 'tooManyAttempts' : 'resetFailed');
        return;
      }
      setSent(true);
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
          aria-invalid={Boolean(fieldError)}
        />
        {fieldError && (
          <p role="alert" className="text-xs text-danger">
            {tValidation(fieldError)}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Send aria-hidden />
        )}
        {t('sendResetLink')}
      </Button>

      {errorKey && (
        <p role="alert" className="text-center text-sm text-danger">
          {t(errorKey)}
        </p>
      )}
    </form>
  );
}
