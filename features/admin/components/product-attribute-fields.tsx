'use client';

import { useTranslations } from 'next-intl';
import { Checkbox, Field, Select } from './form-fields';
import type { AttributeFieldDefinition } from '@/server/queries/admin-products';
import type { Locale } from '@/i18n/routing';

/**
 * The specification fields, drawn from the database.
 *
 * This component is the payoff for CLAUDE.md §6. It knows nothing about phones,
 * RAM or screen size: it is handed the attributes the chosen `ProductType`
 * links to and renders the input each one's `type` calls for. Selling laptops
 * means adding a `ProductType` row and some `AttributeDefinition` rows — this
 * file does not change, and neither does anything else.
 *
 * Values are held as strings and parsed server-side by the same function that
 * decides which column they land in, so the form cannot disagree with the
 * database about what was typed.
 */
export function ProductAttributeFields({
  attributes,
  values,
  onChange,
  locale,
  errorField,
}: {
  attributes: AttributeFieldDefinition[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  locale: Locale;
  /** The attribute key the server rejected, if any. */
  errorField?: string;
}) {
  const t = useTranslations('admin');

  if (attributes.length === 0) {
    return (
      <p className="text-sm text-muted sm:col-span-2">{t('noAttributesForType')}</p>
    );
  }

  return (
    <>
      {attributes.map((attribute) => {
        // Labels are data, written by whoever defined the attribute — which is
        // why a new specification needs no translation key.
        const label = locale === 'ar' ? attribute.labelAr : attribute.labelEn;
        const value = values[attribute.key] ?? '';
        const error = errorField === attribute.key ? t('invalidAttribute') : undefined;
        const hint = attribute.unit ?? undefined;

        if (attribute.type === 'BOOLEAN') {
          return (
            <div key={attribute.key} className="flex items-center">
              <Checkbox
                name={`attr-${attribute.key}`}
                label={label}
                checked={value === 'true'}
                onChange={(event) =>
                  onChange(attribute.key, String(event.target.checked))
                }
              />
            </div>
          );
        }

        if (attribute.type === 'ENUM') {
          return (
            <Select
              key={attribute.key}
              name={`attr-${attribute.key}`}
              label={label}
              value={value}
              error={error}
              onChange={(event) => onChange(attribute.key, event.target.value)}
            >
              <option value="">{attribute.isRequired ? t('choose') : t('none')}</option>
              {attribute.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {locale === 'ar' ? option.labelAr : option.labelEn}
                </option>
              ))}
            </Select>
          );
        }

        const numeric = attribute.type === 'INT' || attribute.type === 'DECIMAL';

        return (
          <Field
            key={attribute.key}
            name={`attr-${attribute.key}`}
            label={label}
            value={value}
            error={error}
            hint={hint}
            required={attribute.isRequired}
            inputMode={numeric ? 'decimal' : undefined}
            // The unit is never typed into the value: it lives on the
            // definition and is appended when the spec is rendered.
            className={numeric ? 'numeric' : undefined}
            onChange={(event) => onChange(attribute.key, event.target.value)}
          />
        );
      })}
    </>
  );
}
