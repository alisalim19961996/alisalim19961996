/**
 * hreflang is the tag that is wrong for months without anyone noticing:
 * nothing renders differently, the site just quietly competes with itself in
 * search results for its other language. So it gets a test.
 */
import { describe, expect, it } from 'vitest';
import { buildAlternates, jsonLdScript } from '@/lib/seo';

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

describe('jsonLdScript', () => {
  it('round-trips ordinary values', () => {
    const value = { '@type': 'Product', name: 'تكنو كامون 40', priceIqd: 385000 };
    expect(JSON.parse(jsonLdScript(value))).toEqual(value);
  });

  it('cannot close the script tag that holds it', () => {
    const hostile = { name: 'Phone</script><script>alert(1)</script>' };
    const serialised = jsonLdScript(hostile);

    expect(serialised).not.toContain('</script>');
    expect(serialised).not.toContain('<script>');
    // Still the same data: a JSON-LD consumer reads \u003c back as "<".
    expect(JSON.parse(serialised)).toEqual(hostile);
  });

  it('escapes every character that can start a tag or an entity', () => {
    const serialised = jsonLdScript({ name: '<>&' });
    expect(serialised).toContain('\\u003c');
    expect(serialised).toContain('\\u003e');
    expect(serialised).toContain('\\u0026');
    expect(JSON.parse(serialised)).toEqual({ name: '<>&' });
  });

  /**
   * The one that would have caught this: paste the output into a script block
   * and parse it as HTML. A serialiser that leaves the tag open produces two
   * elements, not one.
   */
  it('produces exactly one element when embedded in HTML', () => {
    const html = `<script type="application/ld+json">${jsonLdScript({
      name: 'a</script><script>alert(1)</script>b',
    })}</script>`;

    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });
});
