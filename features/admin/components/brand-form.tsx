'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox, Field, FormSection, TextArea } from './form-fields';
import { AdminRecordForm } from './record-form';
import { saveBrandAction, deleteBrandAction } from '../actions';
import { slugify } from '@/lib/domain/product';
import { ACCENT_COLOR_EXAMPLE, EMPTY_ACCENT_INPUT } from '@/lib/domain/taxonomy';
import type { BrandFormValues } from '@/server/queries/admin-taxonomy';

/**
 * Add or edit a brand.
 *
 * One component for both, for the same reason as `ProductForm`: a separate
 * "create" form is how one of them ends up missing a field.
 *
 * A brand with products is never deletable — `Brand.products` is required, so
 * Postgres refuses it too, but as a constraint error nobody can read. The
 * reason is shown here instead, with deactivating named as the answer.
 */

interface State {
  slug: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  logoUrl: string;
  accentColor: string;
  isActive: boolean;
  sortOrder: string;
}

const EMPTY: State = {
  slug: '',
  nameAr: '',
  nameEn: '',
  descriptionAr: '',
  descriptionEn: '',
  logoUrl: '',
  accentColor: '',
  isActive: true,
  sortOrder: '0',
};

export function BrandForm({
  brand,
  productCount = 0,
}: {
  brand?: BrandFormValues;
  productCount?: number;
}) {
  const t = useTranslations('admin');
  const [state, setState] = useState<State>(
    brand
      ? {
          slug: brand.slug,
          nameAr: brand.nameAr,
          nameEn: brand.nameEn,
          descriptionAr: brand.descriptionAr ?? '',
          descriptionEn: brand.descriptionEn ?? '',
          logoUrl: brand.logoUrl ?? '',
          accentColor: brand.accentColor ?? '',
          isActive: brand.isActive,
          sortOrder: String(brand.sortOrder),
        }
      : EMPTY,
  );

  const set = <K extends keyof State>(key: K, value: State[K]) =>
    setState((previous) => ({ ...previous, [key]: value }));

  return (
    <AdminRecordForm
      title={brand ? t('editBrand') : t('newBrand')}
      id={brand?.id}
      name={state.nameAr || state.nameEn}
      listHref="/admin/brands"
      save={() => saveBrandAction(state, brand?.id)}
      remove={() => deleteBrandAction(brand?.id ?? '')}
      deleteBlockedReason={
        productCount > 0 ? t('brandHasProducts', { count: productCount }) : undefined
      }
    >
      <FormSection title={t('identity')}>
        <Field
          label={t('nameAr')}
          name="nameAr"
          value={state.nameAr}
          onChange={(event) => set('nameAr', event.target.value)}
          required
        />
        <Field
          label={t('nameEn')}
          name="nameEn"
          value={state.nameEn}
          onChange={(event) => {
            set('nameEn', event.target.value);
            // Only while creating: a slug is a URL, and changing it later
            // breaks every link a customer or Google already has (§6).
            if (!brand) set('slug', slugify(event.target.value));
          }}
          required
        />
        <Field
          label={t('slug')}
          name="slug"
          hint={t('slugHint')}
          value={state.slug}
          onChange={(event) => set('slug', event.target.value)}
          dir="ltr"
          required
        />
        <Field
          label={t('sortOrder')}
          name="sortOrder"
          type="number"
          min={0}
          hint={t('sortOrderHint')}
          value={state.sortOrder}
          onChange={(event) => set('sortOrder', event.target.value)}
        />
        <TextArea
          label={t('descriptionAr')}
          name="descriptionAr"
          value={state.descriptionAr}
          onChange={(event) => set('descriptionAr', event.target.value)}
        />
        <TextArea
          label={t('descriptionEn')}
          name="descriptionEn"
          value={state.descriptionEn}
          onChange={(event) => set('descriptionEn', event.target.value)}
        />
      </FormSection>

      <FormSection title={t('appearance')} hint={t('accentColorHint')}>
        <Field
          label={t('logoUrl')}
          name="logoUrl"
          hint={t('imagePathHint')}
          value={state.logoUrl}
          onChange={(event) => set('logoUrl', event.target.value)}
          dir="ltr"
        />
        <div className="space-y-1.5">
          <label htmlFor="accentColor" className="text-sm font-medium text-ink">
            {t('accentColor')}
          </label>
          <div className="flex gap-2">
            {/*
              A colour input beside the text one: the swatch is how a person
              picks a colour, the text is how they paste the brand's official
              hex. Both write the same state.
            */}
            <input
              type="color"
              aria-label={t('accentColor')}
              value={
                /^#[0-9a-fA-F]{6}$/.test(state.accentColor)
                  ? state.accentColor
                  : EMPTY_ACCENT_INPUT
              }
              onChange={(event) => set('accentColor', event.target.value)}
              className="h-11 w-14 shrink-0 rounded-control border border-border-field bg-surface p-1"
            />
            <input
              id="accentColor"
              name="accentColor"
              value={state.accentColor}
              onChange={(event) => set('accentColor', event.target.value)}
              placeholder={ACCENT_COLOR_EXAMPLE}
              dir="ltr"
              className="h-11 w-full rounded-control border border-border-field bg-surface px-3 text-sm text-ink numeric transition-colors hover:border-border-strong focus-visible:border-primary"
            />
          </div>
        </div>
      </FormSection>

      <FormSection title={t('visibility')} columns={1}>
        <Checkbox
          label={t('isActive')}
          name="isActive"
          hint={t('brandActiveHint')}
          checked={state.isActive}
          onChange={(event) => set('isActive', event.target.checked)}
        />
      </FormSection>
    </AdminRecordForm>
  );
}
