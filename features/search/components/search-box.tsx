'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Search entry point.
 *
 * Submitting navigates to the catalogue with `?q=`, so a search result is a
 * normal filtered catalogue: same grid, same filters, same shareable URL, one
 * code path. A separate results page would be a second implementation of the
 * same screen that then drifts from it.
 */
export function SearchBox({
  initialQuery = '',
  autoFocus = false,
  className,
  onSubmitted,
}: {
  initialQuery?: string;
  autoFocus?: boolean;
  className?: string;
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const t = useTranslations('nav');
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const query = value.trim();

    startTransition(() => {
      router.push(query ? `/products?q=${encodeURIComponent(query)}` : '/products');
      onSubmitted?.();
    });
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className={cn('relative', isPending && 'opacity-70', className)}
    >
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
        aria-hidden="true"
      />

      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t('searchPlaceholder')}
        aria-label={t('search')}
        autoFocus={autoFocus}
        className={cn(
          'h-11 w-full rounded-full border border-border bg-surface ps-10 pe-10 text-sm text-ink',
          'transition-colors placeholder:text-subtle hover:border-border-strong',
          'focus-visible:border-primary',
          // The browser's own clear button would sit on the wrong side in RTL.
          '[&::-webkit-search-cancel-button]:hidden',
        )}
      />

      {value && (
        <button
          type="button"
          onClick={() => {
            setValue('');
            inputRef.current?.focus();
          }}
          aria-label={t('clearSearch')}
          className="absolute end-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-subtle hover:text-ink"
        >
          <X className="size-4" />
        </button>
      )}
    </form>
  );
}

/** Header search: an icon on phones that opens a full-width overlay. */
export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const t = useTranslations('nav');

  return (
    <>
      <div className="hidden md:block md:w-56 lg:w-72">
        <SearchBox />
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('search')}
        className="inline-flex size-10 items-center justify-center rounded-[--radius-control] text-ink transition-colors hover:bg-canvas md:hidden"
      >
        <Search className="size-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label={t('closeSearch')}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-x-0 top-0 bg-surface p-4 shadow-[--shadow-raised]">
            <div className="flex items-center gap-2">
              <SearchBox
                autoFocus
                className="flex-1"
                onSubmitted={() => setOpen(false)}
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('closeSearch')}
                className="grid size-10 shrink-0 place-items-center rounded-full text-ink hover:bg-canvas"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
