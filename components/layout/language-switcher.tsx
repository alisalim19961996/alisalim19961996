'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { localeLabel, localeShortLabel, locales, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Switching locale keeps the visitor exactly where they were — same page, same
 * filters, same search. Landing on the homepage, or on an unfiltered catalogue
 * after carefully narrowing one, is the fastest way to make a bilingual store
 * feel like two separate sites.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  // next-intl's usePathname returns the path without the locale prefix, which
  // is exactly what its router wants back alongside the new locale.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeLocale = useLocale() as Locale;
  const [isPending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === activeLocale) return;

    const query = searchParams.toString();
    startTransition(() => {
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { locale: next });
    });
  }

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border border-border bg-surface p-0.5',
        isPending && 'opacity-60',
        className,
      )}
      role="group"
      aria-label={localeLabel[activeLocale]}
    >
      {locales.map((locale) => {
        const isActive = locale === activeLocale;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => switchTo(locale)}
            disabled={isPending}
            aria-current={isActive ? 'true' : undefined}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              isActive ? 'bg-ink text-white' : 'text-muted hover:text-ink',
            )}
          >
            {localeShortLabel[locale]}
            <span className="sr-only"> — {localeLabel[locale]}</span>
          </button>
        );
      })}
    </div>
  );
}
