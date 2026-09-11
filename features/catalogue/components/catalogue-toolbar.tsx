'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal, X } from 'lucide-react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { buildCatalogueQuery, SORT_VALUES } from '@/schemas/catalogue';
import { FilterPanel } from './filter-panel';
import type { CatalogueFacets } from '@/server/queries/catalogue';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Sort control. A plain select: it is the accessible, familiar choice here. */
export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('catalogue');
  const [isPending, startTransition] = useTransition();

  const current = searchParams.get('sort') ?? 'newest';

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">{t('sortBy')}</span>
      <select
        value={current}
        disabled={isPending}
        onChange={(event) => {
          const query = buildCatalogueQuery(searchParams, { sort: event.target.value });
          startTransition(() => router.push(`${pathname}${query}`, { scroll: false }));
        }}
        className={cn(
          'h-9 rounded-[--radius-control] border border-border bg-surface px-2 text-sm text-ink',
          'transition-colors hover:border-border-strong focus-visible:border-primary',
        )}
      >
        {SORT_VALUES.map((value) => (
          <option key={value} value={value}>
            {t(`sort.${value}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Mobile filter access.
 *
 * Filters live in a sidebar on desktop and behind this button on phones, where
 * a permanent sidebar would eat the screen the products need. The drawer closes
 * on selection so the shopper sees the result immediately instead of having to
 * find a close button.
 */
export function MobileFilterButton({
  facets,
  activeCount,
}: {
  facets: CatalogueFacets;
  activeCount: number;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('catalogue');

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="lg:hidden"
      >
        <SlidersHorizontal />
        {t('filters')}
        {activeCount > 0 && (
          <span className="ms-1 rounded-full bg-primary px-1.5 text-[11px] text-white numeric">
            {activeCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label={t('closeFilters')}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[--radius-panel] bg-surface p-5 pb-8">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">{t('filters')}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('closeFilters')}
                className="grid size-9 place-items-center rounded-full text-ink hover:bg-canvas"
              >
                <X className="size-5" />
              </button>
            </div>

            <FilterPanel facets={facets} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
