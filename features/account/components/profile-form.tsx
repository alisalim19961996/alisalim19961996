'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateProfileAction, type ProfileState } from '../actions';

/**
 * The customer's own name and phone.
 *
 * `/account` used to print both and tell the customer to get in touch to
 * change them — unpaid manual work for the owner, and a phone call for
 * somebody who mistyped their own number.
 *
 * The email is displayed beside this and is NOT a field. It is the sign-in
 * identity: changing it through an ordinary profile form would let anybody who
 * borrows an unlocked laptop move the account to an address they control, and
 * doing it safely needs a confirmation sent to the OLD address — which needs
 * mail, which is not configured (§7). The screen says that rather than
 * offering a control that quietly refuses.
 */
export function ProfileForm({
  defaultName,
  defaultPhone,
}: {
  defaultName: string;
  /** E.164 as stored, or empty. The customer may type any Iraqi format. */
  defaultPhone: string;
}) {
  const t = useTranslations('account');
  const tValidation = useTranslations('validation');
  const tAdmin = useTranslations('admin');

  const [state, formAction, isSaving] = useActionState<ProfileState, FormData>(
    updateProfileAction,
    { status: 'idle' },
  );

  const fieldError = (name: string) => state.fieldErrors?.[name];

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="profile-name" className="text-sm font-medium text-ink">
          {t('name')}
        </label>
        <Input
          id="profile-name"
          name="name"
          defaultValue={defaultName}
          autoComplete="name"
          required
          aria-invalid={Boolean(fieldError('name'))}
        />
        {fieldError('name') && (
          <p role="alert" className="text-xs text-danger">
            {tValidation(fieldError('name')!)}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="profile-phone" className="text-sm font-medium text-ink">
          {t('phone')}
        </label>
        <Input
          id="profile-phone"
          name="phone"
          defaultValue={defaultPhone}
          autoComplete="tel"
          dir="ltr"
          inputMode="tel"
          className="numeric"
          aria-invalid={Boolean(fieldError('phone'))}
        />
        {fieldError('phone') ? (
          <p role="alert" className="text-xs text-danger">
            {tValidation(fieldError('phone')!)}
          </p>
        ) : (
          <p className="text-xs text-muted">{t('phoneHint')}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={isSaving}>
          {isSaving && <Loader2 className="animate-spin" aria-hidden />}
          {t('saveDetails')}
        </Button>
        {/* Announced, not just coloured: a save that only changes a tick is a
            save a screen-reader user never hears about. */}
        <p role="status" className="text-xs text-success">
          {state.status === 'saved' && (
            <span className="inline-flex items-center gap-1">
              <Check className="size-3.5" aria-hidden />
              {t('detailsSaved')}
            </span>
          )}
        </p>
      </div>

      {state.errorKey && (
        <p role="alert" className="text-xs text-danger">
          {tAdmin(state.errorKey)}
        </p>
      )}
    </form>
  );
}
