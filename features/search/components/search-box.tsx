'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { useFocusTrap } from '@/components/ui/use-focus-trap';
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
          'h-11 w-full rounded-full border border-border-field bg-surface ps-10 pe-10 text-sm text-ink',
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

/**
 * Header search: an icon on phones that opens a full-width overlay.
 *
 * The overlay claimed `aria-modal="true"` — which tells a screen reader that
 * everything behind it is inert — while Tab walked straight out of it into the
 * header links underneath, Escape did nothing, and closing it dropped focus to
 * `<body>` so the next Tab restarted from the top of the page. The mobile nav
 * and the filter drawer made exactly the same claim and were fixed with
 * `useFocusTrap`; this was the third and last one still saying it.
 */
export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const t = useTranslations('nav');
  const opener = useRef<HTMLButtonElement>(null);

  // useCallback so the trap's effect is not torn down and rebuilt on every
  // render of the header — which would re-run its initial focus each time.
  const close = useCallback(() => setOpen(false), []);
  const panel = useFocusTrap({ open, onClose: close, opener });

  return (
    <>
      <div className="hidden md:block md:w-56 lg:w-72">
        <SearchBox />
      </div>

      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('search')}
        aria-expanded={open}
        className="inline-flex size-10 items-center justify-center rounded-control text-ink transition-colors hover:bg-canvas md:hidden"
      >
        <Search className="size-5" />
      </button>

      {open && (
        <div
          ref={panel}
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t('search')}
        >
          <button
            type="button"
            aria-label={t('closeSearch')}
            onClick={close}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-x-0 top-0 bg-surface p-4 shadow-raised">
            <div className="flex items-center gap-2">
              <SearchBox autoFocus className="flex-1" onSubmitted={close} />
              <button
                type="button"
                onClick={close}
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
