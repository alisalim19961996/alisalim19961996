'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, FormSection, Select } from './form-fields';
import { RepeatableRow } from './form-fields';
import { AdminRecordForm } from './record-form';
import { saveAttributeAction, deleteAttributeAction } from '../actions';
import { keyify } from '@/lib/domain/taxonomy';
import { ATTRIBUTE_TYPE_VALUES } from '@/lib/domain/taxonomy';
import type { AttributeFormValues } from '@/server/queries/admin-taxonomy';
import type { TaxonomyReference } from '@/server/queries/admin-taxonomy';
import type { Locale } from '@/i18n/routing';
/*
  A type import, because the layer boundary forbids a value import of Prisma
  from the UI and is right to: it is the rule that keeps the client bundle
  free of server code. Prisma generates this enum as a const object, so the
  type is a union of string literals and `'ENUM'` is checked against it —
  a typo here still fails the build, which is the only thing the enum
  reference was buying.
*/
import type { AttributeDataType } from '@prisma/client';

/**
 * Add or edit one specification — the row a product type links to.
 *
 * `type` is the field that matters most and the one that cannot be taken back:
 * `parseAttributeValue` routes a value into one of five typed columns from it
 * (§6), so changing it after values exist would strand every one of them in
 * the wrong column — stored, invisible on the page, and surviving every later
 * edit unseen. The service refuses that; the form disables the control and
 * says why, so the refusal is not a surprise at save time.
 */

interface OptionState {
  value: string;
  labelAr: string;
  labelEn: string;
}

interface State {
  key: string;
  labelAr: string;
  labelEn: string;
  type: AttributeDataType;
  unit: string;
  groupId: string;
  isFilterable: boolean;
  isComparable: boolean;
  sortOrder: string;
}

const EMPTY_OPTION: OptionState = { value: '', labelAr: '', labelEn: '' };

export function AttributeForm({
  attribute,
  groups,
  locale,
}: {
  attribute?: AttributeFormValues;
  groups: TaxonomyReference['groups'];
  locale: Locale;
}) {
  const t = useTranslations('admin');

  const [state, setState] = useState<State>(
    attribute
      ? {
          key: attribute.key,
          labelAr: attribute.labelAr,
          labelEn: attribute.labelEn,
          type: attribute.type,
          unit: attribute.unit ?? '',
          groupId: attribute.groupId ?? '',
          isFilterable: attribute.isFilterable,
          isComparable: attribute.isComparable,
          sortOrder: String(attribute.sortOrder),
        }
      : {
          key: '',
          labelAr: '',
          labelEn: '',
          type: 'TEXT',
          unit: '',
          groupId: '',
          isFilterable: false,
          isComparable: true,
          sortOrder: '0',
        },
  );

  const [options, setOptions] = useState<OptionState[]>(
    attribute?.options.length ? attribute.options : [EMPTY_OPTION],
  );

  const set = <K extends keyof State>(key: K, value: State[K]) =>
    setState((previous) => ({ ...previous, [key]: value }));

  const typeLocked = Boolean(attribute && attribute.valueCount > 0);
  const isEnum = state.type === 'ENUM';

  return (
    <AdminRecordForm
      title={attribute ? t('editAttribute') : t('newAttribute')}
      id={attribute?.id}
      name={state.labelAr || state.labelEn}
      listHref="/admin/attributes"
      save={() => saveAttributeAction({ ...state, options }, attribute?.id)}
      remove={() => deleteAttributeAction(attribute?.id ?? '')}
      deleteBlockedReason={
        attribute && attribute.valueCount > 0
          ? t('attributeHasValues', { count: attribute.valueCount })
          : undefined
      }
    >
      <FormSection title={t('identity')}>
        <Field
          label={t('labelAr')}
          name="labelAr"
          value={state.labelAr}
          onChange={(event) => set('labelAr', event.target.value)}
          required
        />
        <Field
          label={t('labelEn')}
          name="labelEn"
          value={state.labelEn}
          onChange={(event) => {
            set('labelEn', event.target.value);
            if (!attribute) set('key', keyify(event.target.value));
          }}
          required
        />
        <Field
          label={t('attributeKey')}
          name="key"
          hint={t('attributeKeyHint')}
          value={state.key}
          onChange={(event) => set('key', event.target.value)}
          dir="ltr"
          required
        />
        <Select
          label={t('attributeType')}
          name="type"
          hint={
            typeLocked
              ? t('attributeTypeLocked', { count: attribute?.valueCount ?? 0 })
              : t('attributeTypeHint')
          }
          value={state.type}
          disabled={typeLocked}
          onChange={(event) => set('type', event.target.value as AttributeDataType)}
        >
          {ATTRIBUTE_TYPE_VALUES.map((value) => (
            <option key={value} value={value}>
              {t(`attributeType_${value}`)}
            </option>
          ))}
        </Select>
        <Field
          label={t('unit')}
          name="unit"
          hint={t('unitHint')}
          value={state.unit}
          onChange={(event) => set('unit', event.target.value)}
          dir="ltr"
        />
        <Select
          label={t('attributeGroup')}
          name="groupId"
          hint={t('attributeGroupHint')}
          value={state.groupId}
          onChange={(event) => set('groupId', event.target.value)}
        >
          <option value="">{t('noGroup')}</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {locale === 'ar' ? group.nameAr : group.nameEn}
            </option>
          ))}
        </Select>
        <Field
          label={t('sortOrder')}
          name="sortOrder"
          type="number"
          min={0}
          hint={t('sortOrderHint')}
          value={state.sortOrder}
          onChange={(event) => set('sortOrder', event.target.value)}
        />
      </FormSection>

      {isEnum && (
        <section className="rounded-[--radius-card] border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">{t('attributeOptions')}</h2>
          <p className="mt-1 text-xs text-muted">{t('attributeOptionsHint')}</p>

          <div className="mt-4 space-y-3">
            {options.map((option, index) => (
              <RepeatableRow
                key={index}
                removeLabel={t('remove')}
                onRemove={() =>
                  setOptions((previous) =>
                    previous.length === 1
                      ? [EMPTY_OPTION]
                      : previous.filter((_, i) => i !== index),
                  )
                }
              >
                <Field
                  label={t('optionValue')}
                  hint={t('optionValueHint')}
                  value={option.value}
                  dir="ltr"
                  onChange={(event) =>
                    setOptions((previous) =>
                      previous.map((row, i) =>
                        i === index ? { ...row, value: event.target.value } : row,
                      ),
                    )
                  }
                />
                <Field
                  label={t('optionLabelAr')}
                  value={option.labelAr}
                  onChange={(event) =>
                    setOptions((previous) =>
                      previous.map((row, i) =>
                        i === index ? { ...row, labelAr: event.target.value } : row,
                      ),
                    )
                  }
                />
                <Field
                  label={t('optionLabelEn')}
                  value={option.labelEn}
                  onChange={(event) =>
                    setOptions((previous) =>
                      previous.map((row, i) =>
                        i === index ? { ...row, labelEn: event.target.value } : row,
                      ),
                    )
                  }
                />
              </RepeatableRow>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setOptions((previous) => [...previous, EMPTY_OPTION])}
          >
            <Plus aria-hidden />
            {t('addOption')}
          </Button>
        </section>
      )}

      <FormSection title={t('behaviour')} columns={1}>
        <Checkbox
          label={t('isFilterable')}
          name="isFilterable"
          hint={t('isFilterableHint')}
          checked={state.isFilterable}
          onChange={(event) => set('isFilterable', event.target.checked)}
        />
        <Checkbox
          label={t('isComparable')}
          name="isComparable"
          hint={t('isComparableHint')}
          checked={state.isComparable}
          onChange={(event) => set('isComparable', event.target.checked)}
        />
      </FormSection>
    </AdminRecordForm>
  );
}
