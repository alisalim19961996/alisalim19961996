import { defineRouting } from 'next-intl/routing';

export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ar';

/** Text direction per locale. Drives `dir` on <html> and all logical CSS. */
export const localeDirection: Record<Locale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  en: 'ltr',
};

/** Human label for each locale, written in that locale. */
export const localeLabel: Record<Locale, string> = {
  ar: 'العربية',
  en: 'English',
};

/**
 * `as-needed` would drop the prefix for the default locale, but an Arabic-first
 * store still needs a stable, indexable `/ar` URL for hreflang to point at.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
});
