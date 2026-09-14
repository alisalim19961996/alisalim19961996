'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/navigation';
import { resetPasswordSchema } from '@/schemas/auth';
import { resetPassword } from '../auth-client';

/**
 * Choose a new password, with the token from the emailed link.
 *
 * The token arrives in the query string, which means it is in the address bar,
 * in history, and in the `Referer` of anything this page loads from elsewhere.
 * That is better-auth's own design and is survivable because the token is
 * single-use and expires in an hour — but it is why this page sends the
 * customer to sign in afterwards rather than logging them straight in, and why
 * nothing is rendered from the token itself.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const tValidation = useTranslations('validation');
  const router = useRouter();

  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldErrors({});
    setErrorKey(null);

    const form = new FormData(event.currentTarget);
    const parsed = resetPasswordSchema.safeParse({
      token,
      password: form.get('password'),
      confirmPassword: form.get('confirmPassword'),
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
      const { error } = await resetPassword({
        token: parsed.data.token,
        newPassword: parsed.data.password,
      });

      if (error) {
        // An expired or already-used token is the common case by far, and it
        // is the one the customer can do something about: ask for another.
        setErrorKey(error.status === 429 ? 'tooManyAttempts' : 'resetTokenInvalid');
        return;
      }

      router.replace('/sign-in?reset=1');
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          {t('newPassword')}
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          dir="ltr"
          aria-invalid={Boolean(fieldErrors.password)}
        />
        {fieldErrors.password ? (
          <p role="alert" className="text-xs text-danger">
            {tValidation(fieldErrors.password)}
          </p>
        ) : (
          <p className="text-xs text-muted">{t('passwordHint')}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirmPassword" className="text-sm font-medium text-ink">
          {t('confirmPassword')}
        </label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          dir="ltr"
          aria-invalid={Boolean(fieldErrors.confirmPassword)}
        />
        {fieldErrors.confirmPassword && (
          <p role="alert" className="text-xs text-danger">
            {tValidation(fieldErrors.confirmPassword)}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <KeyRound aria-hidden />
        )}
        {t('savePassword')}
      </Button>

      {errorKey && (
        <p role="alert" className="text-center text-sm text-danger">
          {t(errorKey)}
        </p>
      )}
    </form>
  );
}
