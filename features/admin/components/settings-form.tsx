'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FormSection, TextArea } from './form-fields';
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
      <FormSection title={t('storeIdentity')}>
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
      </FormSection>

      <FormSection title={t('contact')}>
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
      </FormSection>

      <FormSection title={t('deliveryDefaults')}>
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
      </FormSection>

      <FormSection title={t('warranty')}>
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
      </FormSection>

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
