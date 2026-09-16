'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Check, X } from 'lucide-react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { buildCatalogueQuery, toggleCsvValue } from '@/lib/domain/catalogue-url';
import type { CatalogueFacets, FacetOption } from '@/server/queries/catalogue';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Filter controls.
 *
 * Client-side only because they write to the URL; the results themselves are
 * still rendered on the server. Every change goes through the router inside a
 * transition, so the previous results stay on screen (dimmed) while the new
 * ones stream in — a filter that blanks the page on every click feels broken
 * even when it is fast.
 */
export function FilterPanel({
  facets,
  onNavigate,
}: {
  facets: CatalogueFacets;
  /** Lets the mobile drawer close itself after a choice. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale() as Locale;
  const t = useTranslations('catalogue');
  const [isPending, startTransition] = useTransition();

  const isAr = locale === 'ar';

  function navigate(changes: Record<string, string | string[] | null>) {
    const query = buildCatalogueQuery(searchParams, changes);
    startTransition(() => {
      router.push(`${pathname}${query}`, { scroll: false });
      onNavigate?.();
    });
  }

  function toggle(key: string, value: string) {
    navigate({ [key]: toggleCsvValue(searchParams, key, value) });
  }

  function isSelected(key: string, value: string) {
    return (searchParams.get(key) ?? '').split(',').includes(value);
  }

  const label = (option: FacetOption) => (isAr ? option.labelAr : option.labelEn);

  return (
    <div className={cn('space-y-7', isPending && 'opacity-60')}>
      {/*
        Price first, before RAM and storage.

        `priceRange` has been computed by `getCatalogueFacets` since the
        catalogue was built and **nothing ever rendered it** — `min` and `max`
        were in the URL contract, parsed and clamped, reachable only by typing
        them into the address bar. Budget is the first question most phone
        shoppers ask, so it goes at the top rather than under two specification
        groups they may not care about.
      */}
      <PriceFilter
        /*
          Keyed on the URL values so the boxes reset when the range changes
          from outside — the back button, or clearing the chip. React's own
          answer to "reset state when a prop changes": remount, rather than an
          effect that calls setState and renders twice
          (`react-hooks/set-state-in-effect`).
        */
        key={`${searchParams.get('min') ?? ''}-${searchParams.get('max') ?? ''}`}
        range={facets.priceRange}
        min={searchParams.get('min')}
        max={searchParams.get('max')}
        onApply={(next) => navigate(next)}
      />

      <FilterGroup title={t('brand')}>
        {facets.brands.map((option) => (
          <CheckRow
            key={option.value}
            label={label(option)}
            count={option.count}
            checked={isSelected('brand', option.value)}
            onChange={() => toggle('brand', option.value)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={t('category')}>
        {facets.categories.map((option) => (
          <CheckRow
            key={option.value}
            label={label(option)}
            count={option.count}
            checked={isSelected('category', option.value)}
            onChange={() => toggle('category', option.value)}
          />
        ))}
      </FilterGroup>

      {facets.ram.length > 0 && (
        <FilterGroup title={t('ram')}>
          <div className="flex flex-wrap gap-2">
            {facets.ram.map((option) => (
              <ChipRow
                key={option.value}
                label={label(option)}
                checked={isSelected('ram', option.value)}
                onChange={() => toggle('ram', option.value)}
              />
            ))}
          </div>
        </FilterGroup>
      )}

      {facets.storage.length > 0 && (
        <FilterGroup title={t('storage')}>
          <div className="flex flex-wrap gap-2">
            {facets.storage.map((option) => (
              <ChipRow
                key={option.value}
                label={label(option)}
                checked={isSelected('storage', option.value)}
                onChange={() => toggle('storage', option.value)}
              />
            ))}
          </div>
        </FilterGroup>
      )}

      <FilterGroup title={t('availability')}>
        <CheckRow
          label={t('inStockOnly')}
          checked={searchParams.get('stock') === '1'}
          onChange={() =>
            navigate({ stock: searchParams.get('stock') === '1' ? null : '1' })
          }
        />
        <CheckRow
          label={t('onOfferOnly')}
          checked={searchParams.get('offer') === '1'}
          onChange={() =>
            navigate({ offer: searchParams.get('offer') === '1' ? null : '1' })
          }
        />
      </FilterGroup>
    </div>
  );
}

/**
 * The price range, as two whole-dinar boxes.
 *
 * Applied on submit rather than on every keystroke: a range filter that
 * re-queries while the customer is still typing "1" of "150000" shows them
 * three empty result pages on the way to the one they wanted.
 *
 * The values are not validated here beyond being numbers — `schemas/catalogue`
 * already clamps them, swaps a reversed range rather than emptying it, and
 * falls back on nonsense, because they arrive from the address bar and
 * therefore from anyone. Repeating that here would be a second set of rules to
 * keep in step (§13.16).
 */
function PriceFilter({
  range,
  min,
  max,
  onApply,
}: {
  range: { min: number; max: number };
  min: string | null;
  max: string | null;
  onApply: (changes: Record<string, string | null>) => void;
}) {
  const t = useTranslations('catalogue');
  // Initial only: the caller keys this component on the URL values, so a
  // change from outside remounts it rather than syncing it in an effect.
  const [from, setFrom] = useState(min ?? '');
  const [to, setTo] = useState(max ?? '');

  const field =
    'h-11 w-full rounded-control border border-border-field bg-surface px-3 text-sm text-ink numeric transition-colors hover:border-border-strong focus-visible:border-primary';

  return (
    <FilterGroup title={t('price')}>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          onApply({ min: from.trim() || null, max: to.trim() || null });
        }}
      >
        <div className="flex items-center gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-muted">{t('priceFrom')}</span>
            <input
              type="number"
              inputMode="numeric"
              /*
                Only "not negative". Bounding these to the facet range looks
                tidy and blocks the form: HTML5 validation refuses to submit a
                number below `min`, so typing a rough 100000 when the cheapest
                product is 120000 did nothing at all except show a bubble. The
                range belongs in the placeholder, where it is a hint; the
                clamping belongs in `schemas/catalogue`, where it already is.
              */
              min={0}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              placeholder={String(range.min)}
              className={field}
            />
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-xs text-muted">{t('priceTo')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder={String(range.max)}
              className={field}
            />
          </label>
        </div>
        <Button type="submit" variant="outline" size="sm" block>
          {t('priceApply')}
        </Button>
      </form>
    </FilterGroup>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-xs font-semibold tracking-wide text-subtle uppercase">
        {title}
      </legend>
      <div className="space-y-1.5">{children}</div>
    </fieldset>
  );
}

function CheckRow({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-1 text-sm text-ink">
      <span
        className={cn(
          'grid size-[18px] shrink-0 place-items-center rounded border transition-colors',
          checked
            ? 'border-primary bg-primary text-white'
            : 'border-border-strong bg-surface',
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span className="flex-1">{label}</span>
      {count != null && <span className="text-xs text-subtle numeric">{count}</span>}
    </label>
  );
}

function ChipRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium numeric transition-colors',
        checked
          ? 'border-ink bg-ink text-white'
          : 'border-border bg-surface text-ink hover:border-border-strong',
      )}
    >
      {label}
    </button>
  );
}

/** Removable chips summarising what is currently filtered. */
export function ActiveFilters({ facets }: { facets: CatalogueFacets }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale() as Locale;
  const t = useTranslations('catalogue');
  const isAr = locale === 'ar';

  const chips: Array<{ key: string; value: string; label: string }> = [];

  const push = (key: string, options: FacetOption[]) => {
    for (const value of (searchParams.get(key) ?? '').split(',').filter(Boolean)) {
      const option = options.find((entry) => entry.value === value);
      chips.push({
        key,
        value,
        label: option ? (isAr ? option.labelAr : option.labelEn) : value,
      });
    }
  };

  push('brand', facets.brands);
  push('category', facets.categories);
  push('ram', facets.ram);
  push('storage', facets.storage);

  if (searchParams.get('stock') === '1') {
    chips.push({ key: 'stock', value: '1', label: t('inStockOnly') });
  }
  if (searchParams.get('offer') === '1') {
    chips.push({ key: 'offer', value: '1', label: t('onOfferOnly') });
  }

  if (chips.length === 0) return null;

  function remove(key: string, value: string) {
    const changes: Record<string, string | string[] | null> =
      key === 'stock' || key === 'offer'
        ? { [key]: null }
        : { [key]: toggleCsvValue(searchParams, key, value) };
    router.push(`${pathname}${buildCatalogueQuery(searchParams, changes)}`, {
      scroll: false,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={`${chip.key}:${chip.value}`}
          type="button"
          onClick={() => remove(chip.key, chip.value)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-ink transition-colors hover:border-border-strong"
        >
          {chip.label}
          <X className="size-3 text-subtle" />
        </button>
      ))}

      <button
        type="button"
        onClick={() => router.push(pathname, { scroll: false })}
        className="text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        {t('clearAll')}
      </button>
    </div>
  );
}
