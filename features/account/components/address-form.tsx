'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { saveAddressAction, type ProfileState } from '../actions';

/**
 * The delivery address the customer keeps, so checkout starts filled in.
 *
 * The labels come from the `checkout` namespace on purpose: this asks for
 * exactly the fields checkout asks for, and a second set of wordings for the
 * same six questions is how "المدينة" becomes "القضاء" on one screen and not
 * the other. The schema behind both is one object as well (`schemas/address.ts`).
 *
 * Saving here changes nothing about an order that already exists. Checkout
 * snapshots what was typed at the time, because an order has to keep saying
 * where it actually went.
 */
export function AddressForm({
  governorates,
  defaults,
}: {
  governorates: readonly string[];
  defaults: {
    fullName: string;
    phone: string;
    governorate: string;
    city: string;
    addressLine: string;
    notes: string;
  } | null;
}) {
  const t = useTranslations('account');
  const tCheckout = useTranslations('checkout');
  const tGovernorate = useTranslations('governorate');
  const tValidation = useTranslations('validation');
  const tAdmin = useTranslations('admin');

  const [state, formAction, isSaving] = useActionState<ProfileState, FormData>(
    saveAddressAction,
    { status: 'idle' },
  );

  // Controlled, so it survives the form reset React performs after an action.
  const [governorate, setGovernorate] = useState(defaults?.governorate ?? '');

  const fieldError = (name: string) => state.fieldErrors?.[name];

  return (
    <form action={formAction} className="mt-4 grid gap-4 sm:grid-cols-2">
      <Line
        name="fullName"
        label={tCheckout('fullName')}
        defaultValue={defaults?.fullName ?? ''}
        autoComplete="name"
        error={fieldError('fullName')}
        translateError={tValidation}
      />

      <Line
        name="phone"
        label={tCheckout('phone')}
        defaultValue={defaults?.phone ?? ''}
        autoComplete="tel"
        inputMode="tel"
        dir="ltr"
        className="numeric"
        error={fieldError('phone')}
        translateError={tValidation}
      />

      <div className="space-y-1.5">
        <label htmlFor="address-governorate" className="text-sm font-medium text-ink">
          {tCheckout('governorate')}
        </label>
        <select
          id="address-governorate"
          name="governorate"
          required
          value={governorate}
          onChange={(event) => setGovernorate(event.target.value)}
          aria-invalid={Boolean(fieldError('governorate'))}
          className={cn(
            'h-11 w-full rounded-control border border-border-field bg-surface px-3',
            'text-sm text-ink transition-colors hover:border-border-strong',
            'focus-visible:border-primary aria-invalid:border-danger',
          )}
        >
          <option value="" disabled>
            {tCheckout('selectGovernorate')}
          </option>
          {governorates.map((value) => (
            <option key={value} value={value}>
              {tGovernorate(value)}
            </option>
          ))}
        </select>
        {fieldError('governorate') && (
          <p role="alert" className="text-xs text-danger">
            {tValidation('required')}
          </p>
        )}
      </div>

      <Line
        name="city"
        label={tCheckout('city')}
        defaultValue={defaults?.city ?? ''}
        autoComplete="address-level2"
        error={fieldError('city')}
        translateError={tValidation}
      />

      <div className="space-y-1.5 sm:col-span-2">
        <label htmlFor="address-addressLine" className="text-sm font-medium text-ink">
          {tCheckout('addressLine')}
        </label>
        <textarea
          id="address-addressLine"
          name="addressLine"
          rows={2}
          required
          defaultValue={defaults?.addressLine ?? ''}
          autoComplete="street-address"
          aria-invalid={Boolean(fieldError('addressLine'))}
          className={cn(
            'w-full rounded-control border border-border-field bg-surface px-3 py-2.5',
            'text-sm text-ink transition-colors placeholder:text-subtle',
            'hover:border-border-strong focus-visible:border-primary',
            'aria-invalid:border-danger',
          )}
        />
        {fieldError('addressLine') && (
          <p role="alert" className="text-xs text-danger">
            {tValidation(fieldError('addressLine') ?? 'required')}
          </p>
        )}
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <label htmlFor="address-notes" className="text-sm font-medium text-ink">
          {tCheckout('notes')}{' '}
          <span className="font-normal text-subtle">
            ({tCheckout('notesOptional')})
          </span>
        </label>
        <textarea
          id="address-notes"
          name="notes"
          rows={2}
          defaultValue={defaults?.notes ?? ''}
          className="w-full rounded-control border border-border-field bg-surface px-3 py-2.5 text-sm text-ink transition-colors placeholder:text-subtle hover:border-border-strong focus-visible:border-primary"
        />
      </div>

      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" size="sm" variant="outline" disabled={isSaving}>
          {isSaving && <Loader2 className="animate-spin" aria-hidden />}
          {t('saveAddress')}
        </Button>
        <p role="status" className="text-xs text-success">
          {state.status === 'saved' && (
            <span className="inline-flex items-center gap-1">
              <Check className="size-3.5" aria-hidden />
              {t('addressSaved')}
            </span>
          )}
        </p>
      </div>

      {state.errorKey && (
        <p role="alert" className="text-xs text-danger sm:col-span-2">
          {tAdmin(state.errorKey)}
        </p>
      )}
    </form>
  );
}

function Line({
  name,
  label,
  error,
  translateError,
  className,
  ...input
}: {
  name: string;
  label: string;
  error: string | undefined;
  translateError: (key: string) => string;
} & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={`address-${name}`} className="text-sm font-medium text-ink">
        {label}
      </label>
      <Input
        id={`address-${name}`}
        name={name}
        required
        aria-invalid={Boolean(error)}
        className={className}
        {...input}
      />
      {error && (
        <p role="alert" className="text-xs text-danger">
          {translateError(error)}
        </p>
      )}
    </div>
  );
}
