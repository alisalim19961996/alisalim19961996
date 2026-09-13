'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateSiteSettingsAction, type AdminActionResult } from '../actions';

export interface SiteSettingsValues {
  storeNameAr: string;
  storeNameEn: string;
  contactPhone: string;
  whatsappNumber: string;
  contactEmail: string;
  defaultDeliveryIqd: number;
  freeDeliveryOverIqd: number | null;
  warrantyNoteAr: string;
  warrantyNoteEn: string;
}

/**
 * Store settings.
 *
 * Everything on this form is commercial information the owner changes without
 * a developer: the contact number on the site, the warranty wording, the
 * fallback delivery fee. CLAUDE.md §13.13 exists so none of it is ever pasted
 * into a component.
 */
export function SettingsForm({ values }: { values: SiteSettingsValues }) {
  const t = useTranslations('admin');
  const [state, formAction, pending] = useActionState<AdminActionResult, FormData>(
    updateSiteSettingsAction,
    { ok: false },
  );

  return (
    <form action={formAction} className="space-y-8">
      <Section title={t('storeIdentity')}>
        <Field
          name="storeNameAr"
          label={t('storeNameAr')}
          defaultValue={values.storeNameAr}
          required
        />
        <Field
          name="storeNameEn"
          label={t('storeNameEn')}
          defaultValue={values.storeNameEn}
          dir="ltr"
          required
        />
      </Section>

      <Section title={t('contact')}>
        <Field
          name="contactPhone"
          label={t('contactPhone')}
          defaultValue={values.contactPhone}
          inputMode="tel"
          className="numeric"
          hint={t('phoneStoredE164')}
        />
        <Field
          name="whatsappNumber"
          label={t('whatsappNumber')}
          defaultValue={values.whatsappNumber}
          inputMode="tel"
          className="numeric"
        />
        <Field
          name="contactEmail"
          label={t('contactEmail')}
          defaultValue={values.contactEmail}
          type="email"
          dir="ltr"
        />
      </Section>

      <Section title={t('deliveryDefaults')}>
        <Field
          name="defaultDeliveryIqd"
          label={t('defaultDeliveryIqd')}
          defaultValue={String(values.defaultDeliveryIqd)}
          inputMode="numeric"
          className="numeric"
          hint={t('defaultDeliveryHint')}
          required
        />
        <Field
          name="freeDeliveryOverIqd"
          label={t('freeDeliveryOverIqd')}
          defaultValue={values.freeDeliveryOverIqd?.toString() ?? ''}
          inputMode="numeric"
          className="numeric"
          // Empty and zero are different: empty disables the threshold, zero
          // would make every order qualify for free delivery.
          hint={t('freeDeliveryHint')}
        />
      </Section>

      <Section title={t('warranty')}>
        <TextArea
          name="warrantyNoteAr"
          label={t('warrantyNoteAr')}
          defaultValue={values.warrantyNoteAr}
        />
        <TextArea
          name="warrantyNoteEn"
          label={t('warrantyNoteEn')}
          defaultValue={values.warrantyNoteEn}
          dir="ltr"
        />
      </Section>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {t('save')}
        </Button>

        {state.ok && (
          <p className="inline-flex items-center gap-1.5 text-sm text-success">
            <Check className="size-4" aria-hidden />
            {t('saved')}
          </p>
        )}
        {state.errorKey && (
          <p role="alert" className="text-sm text-danger">
            {t(state.errorKey)}
          </p>
        )}
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[--radius-card] border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  name,
  label,
  hint,
  ...props
}: { name: string; label: string; hint?: string } & React.ComponentProps<'input'>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium text-ink">
        {label}
      </label>
      <Input id={name} name={name} {...props} />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function TextArea({
  name,
  label,
  ...props
}: { name: string; label: string } & React.ComponentProps<'textarea'>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={3}
        className="w-full rounded-[--radius-control] border border-border bg-surface px-3 py-2 text-sm text-ink transition-colors hover:border-border-strong focus-visible:border-primary"
        {...props}
      />
    </div>
  );
}
