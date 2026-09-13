'use client';

import { useTranslations } from 'next-intl';
import { Plus, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, RepeatableRow, Select } from './form-fields';
import {
  DEFAULT_SWATCH_HEX,
  optionCombinations,
  suggestSku,
} from '@/lib/domain/product';
import type { Locale } from '@/i18n/routing';

/**
 * Options and the variants they produce.
 *
 * MPS's variants are option-driven by design (CLAUDE.md §13.4): a phone has
 * storage and colour, a cable has length, and neither is a column. So the
 * owner declares the options first, and every variant then answers each of
 * them — which is what lets the storefront's picker dim an unreachable
 * combination instead of hiding it.
 *
 * Prices are strings here and integers by the time they are stored: an input
 * that coerces as you type fights the person filling it in, and the server
 * recomputes and re-validates every figure anyway.
 */

export interface OptionValueState {
  valueAr: string;
  valueEn: string;
  hex: string;
}

export interface OptionState {
  nameAr: string;
  nameEn: string;
  isColor: boolean;
  values: OptionValueState[];
}

export interface VariantState {
  id?: string;
  sku: string;
  priceIqd: string;
  comparePriceIqd: string;
  optionValues: string[];
  labelAr: string;
  labelEn: string;
  imageUrl: string;
  status: string;
  isActive: boolean;
}

export const EMPTY_VARIANT: VariantState = {
  sku: '',
  priceIqd: '',
  comparePriceIqd: '',
  optionValues: [],
  labelAr: '',
  labelEn: '',
  imageUrl: '',
  status: 'IN_STOCK',
  isActive: true,
};

const STOCK_STATUSES = [
  { value: 'IN_STOCK', labelKey: 'inStock' },
  { value: 'OUT_OF_STOCK', labelKey: 'outOfStock' },
  { value: 'PREORDER', labelKey: 'preorder' },
  { value: 'DISCONTINUED', labelKey: 'discontinued' },
] as const;

export function ProductVariantsEditor({
  options,
  variants,
  slug,
  locale,
  errorField,
  onOptionsChange,
  onVariantsChange,
}: {
  options: OptionState[];
  variants: VariantState[];
  /** Seeds generated SKUs, so they read like the product they belong to. */
  slug: string;
  locale: Locale;
  errorField?: string;
  onOptionsChange: (options: OptionState[]) => void;
  onVariantsChange: (variants: VariantState[]) => void;
}) {
  const t = useTranslations('admin');
  const tProduct = useTranslations('product');

  const patchOption = (index: number, patch: Partial<OptionState>) => {
    onOptionsChange(
      options.map((option, i) => (i === index ? { ...option, ...patch } : option)),
    );
  };

  const patchVariant = (index: number, patch: Partial<VariantState>) => {
    onVariantsChange(
      variants.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)),
    );
  };

  /**
   * Fill in every combination the options imply, skipping the ones already
   * listed so a second click does not duplicate rows or overwrite prices.
   */
  const generateVariants = () => {
    const combinations = optionCombinations(
      options.map((option) => option.values.map((value) => value.valueEn)),
    );
    const existing = new Set(variants.map((v) => JSON.stringify(v.optionValues)));
    const additions = combinations
      .filter((combination) => !existing.has(JSON.stringify(combination)))
      .map((combination) => ({
        ...EMPTY_VARIANT,
        sku: suggestSku(slug, combination),
        optionValues: combination,
        // The first variant's price is the obvious starting point for the rest.
        priceIqd: variants[0]?.priceIqd ?? '',
      }));

    onVariantsChange([...variants, ...additions]);
  };

  const optionsDefined = options.length > 0;

  return (
    <div className="space-y-6">
      {/* -- Options ------------------------------------------------------ */}
      <section className="rounded-[--radius-card] border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">{t('options')}</h2>
            <p className="mt-1 text-xs text-muted">{t('optionsHint')}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onOptionsChange([
                ...options,
                { nameAr: '', nameEn: '', isColor: false, values: [] },
              ])
            }
          >
            <Plus aria-hidden />
            {t('addOption')}
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {options.map((option, index) => (
            <RepeatableRow
              key={index}
              removeLabel={t('remove')}
              onRemove={() => {
                onOptionsChange(options.filter((_, i) => i !== index));
                // Every variant's selection is positional, so dropping an
                // option has to drop that column too or the remaining values
                // shift into the wrong option.
                onVariantsChange(
                  variants.map((variant) => ({
                    ...variant,
                    optionValues: variant.optionValues.filter((_, i) => i !== index),
                  })),
                );
              }}
            >
              <Field
                name={`option-${index}-nameAr`}
                label={t('optionNameAr')}
                value={option.nameAr}
                onChange={(event) => patchOption(index, { nameAr: event.target.value })}
              />
              <Field
                name={`option-${index}-nameEn`}
                label={t('optionNameEn')}
                value={option.nameEn}
                dir="ltr"
                onChange={(event) => patchOption(index, { nameEn: event.target.value })}
              />

              <div className="sm:col-span-2">
                <Checkbox
                  name={`option-${index}-isColor`}
                  label={t('isColorOption')}
                  hint={t('isColorHint')}
                  checked={option.isColor}
                  onChange={(event) =>
                    patchOption(index, { isColor: event.target.checked })
                  }
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                {option.values.map((value, valueIndex) => (
                  <div key={valueIndex} className="flex flex-wrap items-end gap-2">
                    <Field
                      name={`option-${index}-value-${valueIndex}-ar`}
                      label={t('valueAr')}
                      value={value.valueAr}
                      className="min-w-32"
                      onChange={(event) =>
                        patchOption(index, {
                          values: option.values.map((v, i) =>
                            i === valueIndex
                              ? { ...v, valueAr: event.target.value }
                              : v,
                          ),
                        })
                      }
                    />
                    <Field
                      name={`option-${index}-value-${valueIndex}-en`}
                      label={t('valueEn')}
                      value={value.valueEn}
                      dir="ltr"
                      className="min-w-32"
                      onChange={(event) =>
                        patchOption(index, {
                          values: option.values.map((v, i) =>
                            i === valueIndex
                              ? { ...v, valueEn: event.target.value }
                              : v,
                          ),
                        })
                      }
                    />
                    {option.isColor && (
                      <div className="space-y-1.5">
                        <label
                          htmlFor={`option-${index}-value-${valueIndex}-hex`}
                          className="block text-sm font-medium text-ink"
                        >
                          {t('swatch')}
                        </label>
                        <input
                          id={`option-${index}-value-${valueIndex}-hex`}
                          type="color"
                          value={value.hex || DEFAULT_SWATCH_HEX}
                          className="h-11 w-14 rounded-[--radius-control] border border-border bg-surface p-1"
                          onChange={(event) =>
                            patchOption(index, {
                              values: option.values.map((v, i) =>
                                i === valueIndex
                                  ? { ...v, hex: event.target.value }
                                  : v,
                              ),
                            })
                          }
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      aria-label={t('remove')}
                      className="h-11 rounded-[--radius-control] px-3 text-muted transition-colors hover:text-danger"
                      onClick={() =>
                        patchOption(index, {
                          values: option.values.filter((_, i) => i !== valueIndex),
                        })
                      }
                    >
                      &times;
                    </button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    patchOption(index, {
                      values: [...option.values, { valueAr: '', valueEn: '', hex: '' }],
                    })
                  }
                >
                  <Plus aria-hidden />
                  {t('addValue')}
                </Button>
              </div>
            </RepeatableRow>
          ))}
        </div>
      </section>

      {/* -- Variants ----------------------------------------------------- */}
      <section className="rounded-[--radius-card] border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">{t('variants')}</h2>
            <p className="mt-1 text-xs text-muted">
              {optionsDefined ? t('variantsHint') : t('variantsNoOptionsHint')}
            </p>
          </div>
          <div className="flex gap-2">
            {optionsDefined && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={generateVariants}
              >
                <Wand2 aria-hidden />
                {t('generateVariants')}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onVariantsChange([
                  ...variants,
                  {
                    ...EMPTY_VARIANT,
                    optionValues: options.map(() => ''),
                  },
                ])
              }
            >
              <Plus aria-hidden />
              {t('addVariant')}
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {variants.map((variant, index) => (
            <RepeatableRow
              key={variant.id ?? index}
              removeLabel={t('remove')}
              onRemove={() => onVariantsChange(variants.filter((_, i) => i !== index))}
            >
              <Field
                name={`variant-${index}-sku`}
                label={tProduct('sku')}
                value={variant.sku}
                dir="ltr"
                className="numeric"
                error={
                  errorField?.startsWith(`variants.${index}.sku`)
                    ? t('invalidSku')
                    : undefined
                }
                onChange={(event) => patchVariant(index, { sku: event.target.value })}
              />
              <Field
                name={`variant-${index}-price`}
                label={t('priceIqd')}
                value={variant.priceIqd}
                inputMode="numeric"
                className="numeric"
                dir="ltr"
                onChange={(event) =>
                  patchVariant(index, { priceIqd: event.target.value })
                }
              />
              <Field
                name={`variant-${index}-compare`}
                label={t('comparePriceIqd')}
                hint={t('comparePriceHint')}
                value={variant.comparePriceIqd}
                inputMode="numeric"
                className="numeric"
                dir="ltr"
                error={
                  errorField?.startsWith(`variants.${index}.comparePriceIqd`)
                    ? t('comparePriceTooLow')
                    : undefined
                }
                onChange={(event) =>
                  patchVariant(index, { comparePriceIqd: event.target.value })
                }
              />
              <Select
                name={`variant-${index}-status`}
                label={t('availability')}
                value={variant.status}
                onChange={(event) =>
                  patchVariant(index, { status: event.target.value })
                }
              >
                {STOCK_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {tProduct(status.labelKey)}
                  </option>
                ))}
              </Select>

              {options.map((option, optionIndex) => (
                <Select
                  key={optionIndex}
                  name={`variant-${index}-option-${optionIndex}`}
                  label={locale === 'ar' ? option.nameAr : option.nameEn}
                  value={variant.optionValues[optionIndex] ?? ''}
                  onChange={(event) =>
                    patchVariant(index, {
                      optionValues: options.map((_, i) =>
                        i === optionIndex
                          ? event.target.value
                          : (variant.optionValues[i] ?? ''),
                      ),
                    })
                  }
                >
                  <option value="">{t('choose')}</option>
                  {option.values.map((value) => (
                    <option key={value.valueEn} value={value.valueEn}>
                      {locale === 'ar' ? value.valueAr : value.valueEn}
                    </option>
                  ))}
                </Select>
              ))}

              {!optionsDefined && (
                <>
                  <Field
                    name={`variant-${index}-labelAr`}
                    label={t('variantLabelAr')}
                    value={variant.labelAr}
                    onChange={(event) =>
                      patchVariant(index, { labelAr: event.target.value })
                    }
                  />
                  <Field
                    name={`variant-${index}-labelEn`}
                    label={t('variantLabelEn')}
                    value={variant.labelEn}
                    dir="ltr"
                    onChange={(event) =>
                      patchVariant(index, { labelEn: event.target.value })
                    }
                  />
                </>
              )}

              <Field
                name={`variant-${index}-image`}
                label={t('variantImage')}
                hint={t('imagePathHint')}
                value={variant.imageUrl}
                dir="ltr"
                wide
                onChange={(event) =>
                  patchVariant(index, { imageUrl: event.target.value })
                }
              />

              <div className="sm:col-span-2">
                <Checkbox
                  name={`variant-${index}-active`}
                  label={t('variantActive')}
                  hint={t('variantActiveHint')}
                  checked={variant.isActive}
                  onChange={(event) =>
                    patchVariant(index, { isActive: event.target.checked })
                  }
                />
              </div>
            </RepeatableRow>
          ))}
        </div>
      </section>
    </div>
  );
}
