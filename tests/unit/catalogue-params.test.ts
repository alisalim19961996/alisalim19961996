import { describe, expect, it } from 'vitest';
import {
  buildCatalogueQuery,
  countActiveFilters,
  parseCatalogueParams,
  toFilters,
  toggleCsvValue,
} from '@/schemas/catalogue';

/**
 * Catalogue params come from the address bar, which means they come from
 * anyone. These tests are as much about what the parser refuses as what it
 * accepts.
 */

describe('parseCatalogueParams', () => {
  it('returns usable defaults for an empty query string', () => {
    const params = parseCatalogueParams({});
    expect(params.sort).toBe('newest');
    expect(params.page).toBe(1);
    expect(params.brand).toEqual([]);
    expect(params.stock).toBe(false);
  });

  it('splits comma lists and drops blanks and duplicates', () => {
    const params = parseCatalogueParams({ brand: 'tecno,,infinix,tecno' });
    expect(params.brand).toEqual(['tecno', 'infinix']);
  });

  it('keeps only sane integers in numeric lists', () => {
    const params = parseCatalogueParams({ ram: '8,abc,-4,0,12,99999' });
    expect(params.ram).toEqual([8, 12]);
  });

  it('falls back instead of throwing on a nonsense sort', () => {
    expect(parseCatalogueParams({ sort: 'DROP TABLE' }).sort).toBe('newest');
  });

  it('falls back instead of throwing on a nonsense page', () => {
    expect(parseCatalogueParams({ page: '-3' }).page).toBe(1);
    expect(parseCatalogueParams({ page: 'abc' }).page).toBe(1);
    expect(parseCatalogueParams({ page: '99999' }).page).toBe(1);
  });

  it('takes the first value when a key is repeated', () => {
    // ?page=2&page=9 must mean one page, not two.
    expect(parseCatalogueParams({ page: ['2', '9'] }).page).toBe(2);
  });

  it('treats the stock and offer flags as strictly "1"', () => {
    expect(parseCatalogueParams({ stock: '1' }).stock).toBe(true);
    expect(parseCatalogueParams({ stock: 'true' }).stock).toBe(false);
    expect(parseCatalogueParams({ stock: 'yes' }).stock).toBe(false);
  });

  it('caps an overlong search query rather than passing it through', () => {
    const params = parseCatalogueParams({ q: 'x'.repeat(500) });
    // Over-length input is rejected by the schema, so the whole parse falls
    // back to defaults rather than querying with a 500-character term.
    expect(params.q).toBeUndefined();
  });
});

describe('toFilters', () => {
  it('swaps a reversed price range instead of returning nothing', () => {
    const filters = toFilters(parseCatalogueParams({ min: '900000', max: '200000' }));
    expect(filters.minPrice).toBe(200000);
    expect(filters.maxPrice).toBe(900000);
  });

  it('leaves a correct range alone', () => {
    const filters = toFilters(parseCatalogueParams({ min: '200000', max: '900000' }));
    expect(filters.minPrice).toBe(200000);
    expect(filters.maxPrice).toBe(900000);
  });
});

describe('countActiveFilters', () => {
  it('counts every dimension a shopper has narrowed', () => {
    const params = parseCatalogueParams({
      brand: 'tecno,infinix',
      ram: '8',
      stock: '1',
      type: 'phone',
    });
    // 2 brands + 1 ram + stock + type
    expect(countActiveFilters(params)).toBe(5);
  });

  it('does not count sort, page or the search term as filters', () => {
    const params = parseCatalogueParams({ sort: 'price_asc', page: '3', q: 'tecno' });
    expect(countActiveFilters(params)).toBe(0);
  });
});

describe('buildCatalogueQuery', () => {
  it('resets to page 1 whenever a filter changes', () => {
    const current = new URLSearchParams('brand=tecno&page=7');
    const query = buildCatalogueQuery(current, { brand: ['tecno', 'infinix'] });
    expect(query).toContain('brand=tecno%2Cinfinix');
    expect(query).not.toContain('page=');
  });

  it('keeps the page when the page itself is what changed', () => {
    const current = new URLSearchParams('brand=tecno');
    expect(buildCatalogueQuery(current, { page: '3' })).toContain('page=3');
  });

  it('removes a param when its value empties out', () => {
    const current = new URLSearchParams('brand=tecno&sort=price_asc');
    const query = buildCatalogueQuery(current, { brand: [] });
    expect(query).not.toContain('brand');
    expect(query).toContain('sort=price_asc');
  });

  it('returns an empty string, not a bare "?", when nothing is left', () => {
    expect(buildCatalogueQuery(new URLSearchParams('brand=tecno'), { brand: [] })).toBe(
      '',
    );
  });
});

describe('toggleCsvValue', () => {
  it('adds a value that is not selected', () => {
    expect(
      toggleCsvValue(new URLSearchParams('brand=tecno'), 'brand', 'honor'),
    ).toEqual(['tecno', 'honor']);
  });

  it('removes a value that is selected', () => {
    expect(
      toggleCsvValue(new URLSearchParams('brand=tecno,honor'), 'brand', 'tecno'),
    ).toEqual(['honor']);
  });

  it('works from an absent param', () => {
    expect(toggleCsvValue(new URLSearchParams(), 'brand', 'tecno')).toEqual(['tecno']);
  });
});
