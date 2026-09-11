'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { ProductPrice } from './product-price';
import { getAvailability } from '@/lib/domain/availability';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Variant selection.
 *
 * One of the few genuinely interactive parts of a product page, so one of the
 * few client components. Selecting options changes the price, the SKU and the
 * availability line together — they are three views of the same variant, and
 * letting them disagree even briefly is how a shopper ends up adding something
 * other than what they saw.
 *
 * Combinations that do not exist are disabled rather than hidden: a colour that
 * silently vanishes when you pick 12GB reads as a bug, while a struck-through
 * colour reads as information.
 */

export interface PickerOptionValue {
  id: string;
  valueAr: string;
  valueEn: string;
  hex: string | null;
}

export interface PickerOption {
  id: string;
  nameAr: string;
  nameEn: string;
  isColor: boolean;
  values: PickerOptionValue[];
}

export interface PickerVariant {
  id: string;
  sku: string;
  labelAr: string;
  labelEn: string;
  priceIqd: number;
  comparePriceIqd: number | null;
  optionValueIds: string[];
  inventory: {
    status: 'IN_STOCK' | 'OUT_OF_STOCK' | 'PREORDER' | 'DISCONTINUED';
    trackQuantity: boolean;
    onHand: number;
    reserved: number;
  } | null;
}

export function VariantPicker({
  options,
  variants,
}: {
  options: PickerOption[];
  variants: PickerVariant[];
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('product');
  const isAr = locale === 'ar';

  // Start on the first variant a shopper could actually buy, falling back to
  // the first one so the page is never in a stateless limbo.
  const initial = useMemo(() => {
    const buyable = variants.find(
      (variant) =>
        variant.inventory &&
        ['available', 'preorder'].includes(getAvailability(variant.inventory).kind),
    );
    return buyable ?? variants[0];
  }, [variants]);

  const [selectedIds, setSelectedIds] = useState<string[]>(
    initial?.optionValueIds ?? [],
  );

  const selected = useMemo(() => {
    return (
      variants.find(
        (variant) =>
          variant.optionValueIds.length === selectedIds.length &&
          variant.optionValueIds.every((id) => selectedIds.includes(id)),
      ) ?? null
    );
  }, [variants, selectedIds]);

  /** Would choosing this value still leave a real variant to buy? */
  function isReachable(optionId: string, valueId: string): boolean {
    const others = selectedIds.filter(
      (id) => !options.find((o) => o.id === optionId)?.values.some((v) => v.id === id),
    );
    return variants.some(
      (variant) =>
        variant.optionValueIds.includes(valueId) &&
        others.every((id) => variant.optionValueIds.includes(id)),
    );
  }

  function choose(optionId: string, valueId: string) {
    const option = options.find((entry) => entry.id === optionId);
    if (!option) return;

    const withoutThisOption = selectedIds.filter(
      (id) => !option.values.some((value) => value.id === id),
    );
    const next = [...withoutThisOption, valueId];

    // If the new pair does not exist, keep this choice and move the other
    // options to whatever variant does — picking a colour should never dead-end.
    const exists = variants.some(
      (variant) =>
        variant.optionValueIds.length === next.length &&
        next.every((id) => variant.optionValueIds.includes(id)),
    );

    if (exists) {
      setSelectedIds(next);
      return;
    }

    const fallback = variants.find((variant) =>
      variant.optionValueIds.includes(valueId),
    );
    setSelectedIds(fallback?.optionValueIds ?? next);
  }

  const availability = selected?.inventory
    ? getAvailability(selected.inventory)
    : { kind: 'out_of_stock' as const };

  const purchasable =
    availability.kind === 'available' || availability.kind === 'preorder';

  return (
    <div className="space-y-6">
      {selected && (
        <ProductPrice
          priceIqd={selected.priceIqd}
          comparePriceIqd={selected.comparePriceIqd}
          size="lg"
        />
      )}

      <AvailabilityLine kind={availability.kind} />

      {options.map((option) => (
        <fieldset key={option.id}>
          <legend className="mb-2.5 text-xs font-semibold tracking-wide text-subtle uppercase">
            {isAr ? option.nameAr : option.nameEn}
          </legend>

          <div className="flex flex-wrap gap-2">
            {option.values.map((value) => {
              const active = selectedIds.includes(value.id);
              const reachable = isReachable(option.id, value.id);
              const label = isAr ? value.valueAr : value.valueEn;

              if (option.isColor && value.hex) {
                return (
                  <button
                    key={value.id}
                    type="button"
                    onClick={() => choose(option.id, value.id)}
                    aria-pressed={active}
                    aria-label={label}
                    title={label}
                    className={cn(
                      'relative grid size-9 place-items-center rounded-full border-2 transition-colors',
                      active ? 'border-ink' : 'border-border',
                      !reachable && 'opacity-40',
                    )}
                  >
                    <span
                      className="size-6 rounded-full border border-black/10"
                      style={{ backgroundColor: value.hex }}
                    />
                    {active && (
                      <Check
                        className="absolute size-3.5 text-white mix-blend-difference"
                        strokeWidth={3}
                      />
                    )}
                  </button>
                );
              }

              return (
                <button
                  key={value.id}
                  type="button"
                  onClick={() => choose(option.id, value.id)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-[--radius-control] border px-3.5 py-2 text-sm font-medium numeric transition-colors',
                    active
                      ? 'border-ink bg-ink text-white'
                      : 'border-border bg-surface text-ink hover:border-border-strong',
                    !reachable && 'opacity-40',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {selected && (
        <p className="text-xs text-subtle">
          {t('sku')}: <span className="numeric">{selected.sku}</span>
        </p>
      )}

      {/*
        The cart lands in Phase 3. Disabling the button rather than omitting it
        keeps the page's real layout — and its mobile bar height — honest now.
      */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" block disabled={!purchasable} className="sm:flex-1">
          {t('addToCart')}
        </Button>
        <Button
          size="lg"
          variant="outline"
          block
          disabled={!purchasable}
          className="sm:flex-1"
        >
          {t('buyNow')}
        </Button>
      </div>
    </div>
  );
}

function AvailabilityLine({ kind }: { kind: string }) {
  const t = useTranslations('product');

  const map: Record<string, { label: string; className: string }> = {
    available: { label: t('inStock'), className: 'text-success' },
    preorder: { label: t('preorder'), className: 'text-warning' },
    out_of_stock: { label: t('outOfStock'), className: 'text-danger' },
    discontinued: { label: t('discontinued'), className: 'text-muted' },
    insufficient: { label: t('lowStock'), className: 'text-warning' },
  };

  const entry = map[kind] ?? map.out_of_stock!;

  return (
    <p className={cn('flex items-center gap-2 text-sm font-medium', entry.className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {entry.label}
    </p>
  );
}
