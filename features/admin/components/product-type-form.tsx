'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Checkbox, Field, FormSection } from './form-fields';
import { AdminRecordForm } from './record-form';
import { saveProductTypeAction, deleteProductTypeAction } from '../actions';
import { keyify } from '@/lib/domain/taxonomy';
import { cn } from '@/lib/utils';
import type { ProductTypeFormValues } from '@/server/queries/admin-taxonomy';
import type { TaxonomyReference } from '@/server/queries/admin-taxonomy';
import type { Locale } from '@/i18n/routing';

/**
 * Add or edit a product type — and choose the specifications it asks for.
 *
 * This is the screen CLAUDE.md §6 promised: "adding laptops is one
 * `ProductType` row and some attribute rows — no code". The attribute list
 * below is those rows. Tick "screen size" and every laptop's form grows a
 * screen-size field, and every laptop's page grows a screen-size row, without
 * anything being written.
 *
 * Unticking one hides the field and KEEPS the data: the stored value lives on
 * `ProductAttributeValue`, which points at the definition rather than at this
 * link, so re-ticking it brings the values back. Worth knowing before the
 * owner unticks something in a panic.
 */

interface LinkState {
  definitionId: string;
  isRequired: boolean;
}

interface State {
  key: string;
  nameAr: string;
  nameEn: string;
  icon: string;
  isActive: boolean;
  sortOrder: string;
}

export function ProductTypeForm({
  productType,
  attributes,
  locale,
  productCount = 0,
}: {
  productType?: ProductTypeFormValues;
  attributes: TaxonomyReference['attributes'];
  locale: Locale;
  productCount?: number;
}) {
  const t = useTranslations('admin');

  const [state, setState] = useState<State>(
    productType
      ? {
          key: productType.key,
          nameAr: productType.nameAr,
          nameEn: productType.nameEn,
          icon: productType.icon ?? '',
          isActive: productType.isActive,
          sortOrder: String(productType.sortOrder),
        }
      : { key: '', nameAr: '', nameEn: '', icon: '', isActive: true, sortOrder: '0' },
  );

  const [links, setLinks] = useState<LinkState[]>(
    productType?.attributes.map((link) => ({
      definitionId: link.definitionId,
      isRequired: link.isRequired,
    })) ?? [],
  );

  const set = <K extends keyof State>(key: K, value: State[K]) =>
    setState((previous) => ({ ...previous, [key]: value }));

  const linked = new Map(links.map((link, index) => [link.definitionId, index]));

  const toggle = (definitionId: string) =>
    setLinks((previous) =>
      linked.has(definitionId)
        ? previous.filter((link) => link.definitionId !== definitionId)
        : [...previous, { definitionId, isRequired: false }],
    );

  const move = (index: number, by: -1 | 1) =>
    setLinks((previous) => {
      const next = [...previous];
      const target = index + by;
      const a = next[index];
      const b = next[target];
      if (!a || !b) return previous;
      next[index] = b;
      next[target] = a;
      return next;
    });

  const unlinked = attributes.filter((a) => !linked.has(a.id));
  const label = (attribute: TaxonomyReference['attributes'][number]) =>
    locale === 'ar' ? attribute.labelAr : attribute.labelEn;

  return (
    <AdminRecordForm
      title={productType ? t('editProductType') : t('newProductType')}
      id={productType?.id}
      name={state.nameAr || state.nameEn}
      listHref="/admin/product-types"
      save={() =>
        saveProductTypeAction(
          {
            ...state,
            // Position is the order, so the owner reorders by moving rows
            // rather than by typing numbers that then tie.
            attributes: links.map((link, index) => ({ ...link, sortOrder: index })),
          },
          productType?.id,
        )
      }
      remove={() => deleteProductTypeAction(productType?.id ?? '')}
      deleteBlockedReason={
        productCount > 0
          ? t('productTypeHasProducts', { count: productCount })
          : undefined
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
            // The key is what `ProductTypeAttribute` links and what the
            // catalogue's `?type=` puts in the URL, so it is fixed on create.
            if (!productType) set('key', keyify(event.target.value));
          }}
          required
        />
        <Field
          label={t('typeKey')}
          name="key"
          hint={t('typeKeyHint')}
          value={state.key}
          onChange={(event) => set('key', event.target.value)}
          dir="ltr"
          required
        />
        <Field
          label={t('icon')}
          name="icon"
          hint={t('iconHint')}
          value={state.icon}
          onChange={(event) => set('icon', event.target.value)}
          dir="ltr"
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
      </FormSection>

      <section className="rounded-[--radius-card] border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">{t('specifications')}</h2>
        <p className="mt-1 text-xs text-muted">{t('typeAttributesHint')}</p>

        {links.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t('noAttributesLinked')}</p>
        ) : (
          <ol className="mt-4 space-y-2">
            {links.map((link, index) => {
              const attribute = attributes.find((a) => a.id === link.definitionId);
              return (
                <li
                  key={link.definitionId}
                  className="flex flex-wrap items-center gap-3 rounded-[--radius-control] border border-border bg-canvas p-3"
                >
                  <span className="w-6 text-xs text-subtle numeric">{index + 1}</span>
                  <span className="text-sm font-medium text-ink">
                    {attribute ? label(attribute) : link.definitionId}
                  </span>
                  {attribute?.unit && (
                    <span className="text-xs text-muted numeric">{attribute.unit}</span>
                  )}
                  <span className="text-xs text-subtle numeric">{attribute?.key}</span>

                  <label className="ms-auto flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={link.isRequired}
                      onChange={(event) =>
                        setLinks((previous) =>
                          previous.map((row, i) =>
                            i === index
                              ? { ...row, isRequired: event.target.checked }
                              : row,
                          ),
                        )
                      }
                      className="size-4 rounded-[0.25rem] border-border accent-[--color-primary]"
                    />
                    {t('requiredSpec')}
                  </label>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={t('moveUp')}
                      title={t('moveUp')}
                      className="grid size-8 place-items-center rounded-[--radius-control] text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-30"
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === links.length - 1}
                      aria-label={t('moveDown')}
                      title={t('moveDown')}
                      className="grid size-8 place-items-center rounded-[--radius-control] text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-30"
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(link.definitionId)}
                      aria-label={t('unlinkAttribute')}
                      title={t('unlinkAttribute')}
                      className="grid size-8 place-items-center rounded-[--radius-control] text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      &times;
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {unlinked.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted">{t('addSpecification')}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {unlinked.map((attribute) => (
                <li key={attribute.id}>
                  <button
                    type="button"
                    onClick={() => toggle(attribute.id)}
                    className={cn(
                      'rounded-[--radius-control] border border-border px-3 py-1.5 text-xs text-ink transition-colors',
                      'hover:border-primary hover:bg-primary-soft',
                    )}
                  >
                    + {label(attribute)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <FormSection title={t('visibility')} columns={1}>
        <Checkbox
          label={t('isActive')}
          name="isActive"
          hint={t('productTypeActiveHint')}
          checked={state.isActive}
          onChange={(event) => set('isActive', event.target.checked)}
        />
      </FormSection>
    </AdminRecordForm>
  );
}
