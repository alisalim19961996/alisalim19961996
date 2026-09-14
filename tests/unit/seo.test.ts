/**
 * hreflang is the tag that is wrong for months without anyone noticing:
 * nothing renders differently, the site just quietly competes with itself in
 * search results for its other language. So it gets a test.
 */
import { describe, expect, it } from 'vitest';
import { buildAlternates } from '@/lib/seo';

describe('buildAlternates', () => {
  it('prefixes the canonical with the current locale', () => {
    expect(buildAlternates('/brands', 'ar')).toMatchObject({
      canonical: '/ar/brands',
    });
    expect(buildAlternates('/brands', 'en')).toMatchObject({
      canonical: '/en/brands',
    });
  });

  it('lists every locale, including the current one', () => {
    // A self-referencing hreflang is required, not optional: omitting it is
    // the most common way the whole set gets ignored.
    expect(buildAlternates('/offers', 'ar')).toMatchObject({
      languages: { ar: '/ar/offers', en: '/en/offers' },
    });
  });

  it('does not leave a trailing slash on the homepage', () => {
    // '/ar/' and '/ar' are two URLs to a crawler, and only one of them is
    // what the site actually serves.
    expect(buildAlternates('/', 'ar')).toEqual({
      canonical: '/ar',
      languages: { ar: '/ar', en: '/en' },
    });
  });
});
