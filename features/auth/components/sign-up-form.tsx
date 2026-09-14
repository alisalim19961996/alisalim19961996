'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/navigation';
import { registerSchema } from '@/schemas/auth';
import { signUp } from '../auth-client';
import { claimCartAfterSignInAction } from '../actions';

/**
 * Create an account.
 *
 * Posted from the browser for the same reason as sign-in: better-auth applies
 * its rate limits inside its HTTP handler, so registration going through a
 * Server Action would leave "3 sign-ups per 5 minutes" documented and
 * unenforced — and an unthrottled sign-up endpoint is how a database fills
 * with junk accounts overnight.
 *
 * The role is never sent. It is declared `input: false` on the server
 * (§7), so a crafted payload asking for ADMIN is ignored rather than trusted.
 */
export function SignUpForm() {
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
    const phone = String(form.get('phone') ?? '').trim();

    const parsed = registerSchema.safeParse({
      name: form.get('name'),
      email: form.get('email'),
      // Optional: an empty field must read as "not given", not as an invalid
      // Iraqi number — the same blank-is-undefined trap as the env schema.
      ...(phone ? { phone } : {}),
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
      const { error } = await signUp.email({
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
        ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
      });

      if (error) {
        if (error.status === 429) {
          setErrorKey('tooManyAttempts');
          return;
        }
        // 422 is better-auth's "that address already has an account". Saying so
        // is the right call here and not at sign-in: a registration form that
        // refuses without explaining leaves someone retyping the same address
        // forever, and the address is one they just typed themselves.
        setErrorKey(error.status === 422 ? 'emailTaken' : 'signUpFailed');
        return;
      }

      // Anything they put in the cart before registering follows them in.
      await claimCartAfterSignInAction();

      router.replace('/account');
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field
        id="name"
        label={t('fullName')}
        autoComplete="name"
        error={fieldErrors.name && tValidation(fieldErrors.name)}
        required
      />
      <Field
        id="email"
        label={t('email')}
        type="email"
        autoComplete="email"
        dir="ltr"
        error={fieldErrors.email && tValidation(fieldErrors.email)}
        required
      />
      <Field
        id="phone"
        label={t('phoneOptional')}
        type="tel"
        autoComplete="tel"
        dir="ltr"
        placeholder="07XX XXX XXXX"
        error={fieldErrors.phone && tValidation(fieldErrors.phone)}
      />
      <Field
        id="password"
        label={t('password')}
        type="password"
        autoComplete="new-password"
        dir="ltr"
        hint={t('passwordHint')}
        error={fieldErrors.password && tValidation(fieldErrors.password)}
        required
      />
      <Field
        id="confirmPassword"
        label={t('confirmPassword')}
        type="password"
        autoComplete="new-password"
        dir="ltr"
        error={fieldErrors.confirmPassword && tValidation(fieldErrors.confirmPassword)}
        required
      />

      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <UserPlus aria-hidden />
        )}
        {pending ? t('creatingAccount') : t('createAccount')}
      </Button>

      {errorKey && (
        <p role="alert" className="text-center text-sm text-danger">
          {t(errorKey)}
        </p>
      )}
    </form>
  );
}

/** Local to this form: five near-identical fields, one definition. */
function Field({
  id,
  label,
  hint,
  error,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
  /*
    The translated message, not the key. A `translate` prop was tried and
    collides with the native HTML attribute of that name, which is typed
    "yes" | "no" — so the spread below silently poisoned every field.
  */
  error?: string | false;
} & React.ComponentProps<'input'>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <Input id={id} name={id} aria-invalid={Boolean(error)} {...props} />
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}
