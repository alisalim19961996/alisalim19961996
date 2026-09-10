'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useParams } from 'next/navigation';
import { localeLabel, locales, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Switching locale keeps the visitor on the same page rather than dumping them
 * on the homepage — losing your place is the fastest way to make a bilingual
 * store feel broken.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const activeLocale = useLocale() as Locale;
  const [isPending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === activeLocale) return;
    startTransition(() => {
      router.replace(
        // @ts-expect-error -- pathname is a known route; params carry the
        // dynamic segments for the current one.
        { pathname, params },
        { locale: next },
      );
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
              isActive
                ? 'bg-ink text-white'
                : 'text-muted hover:text-ink',
            )}
          >
            {locale === 'ar' ? 'ع' : 'EN'}
            <span className="sr-only"> — {localeLabel[locale]}</span>
          </button>
        );
      })}
    </div>
  );
}
