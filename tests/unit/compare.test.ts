import { describe, expect, it } from 'vitest';
import {
  COMPARE_PARAM,
  MAX_COMPARE,
  compareHref,
  parseCompareSlugs,
  toggleCompareSlug,
} from '@/lib/domain/compare-url';
import { buildComparisonRows, type ComparableProduct } from '@/lib/domain/compare';

/**
 * The comparison, without a database.
 *
 * Two things are worth pinning here. The `?ids=` value comes from the address
 * bar, so it comes from anyone — and the table's alignment, because a value
 * landing in the wrong column is a bug a reader would believe rather than
 * notice.
 */

describe('parseCompareSlugs', () => {
  it('reads a plain list', () => {
    expect(parseCompareSlugs('tecno-spark,samsung-a15')).toEqual([
      'tecno-spark',
      'samsung-a15',
    ]);
  });

  it('is empty for nothing at all', () => {
    expect(parseCompareSlugs(null)).toEqual([]);
    expect(parseCompareSlugs(undefined)).toEqual([]);
    expect(parseCompareSlugs('')).toEqual([]);
    expect(parseCompareSlugs(',,,')).toEqual([]);
  });

  it('drops what is not a slug rather than refusing the whole link', () => {
    // A shared link with one stale entry should still compare the rest.
    expect(parseCompareSlugs('good-one,../../etc/passwd,<script>,ok-two')).toEqual([
      'good-one',
      'ok-two',
    ]);
  });

  it('deduplicates, because a product cannot be compared with itself', () => {
    expect(parseCompareSlugs('a-phone,a-phone,b-phone')).toEqual([
      'a-phone',
      'b-phone',
    ]);
  });

  it(`never returns more than ${MAX_COMPARE}`, () => {
    const many = Array.from({ length: 12 }, (_, index) => `phone-${index}`).join(',');
    expect(parseCompareSlugs(many)).toHaveLength(MAX_COMPARE);
  });

  it('normalises case and surrounding space', () => {
    expect(parseCompareSlugs(' Tecno-Spark , samsung-a15 ')).toEqual([
      'tecno-spark',
      'samsung-a15',
    ]);
  });
});

describe('toggleCompareSlug', () => {
  it('adds and removes', () => {
    expect(toggleCompareSlug([], 'a')).toEqual(['a']);
    expect(toggleCompareSlug(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('returns the list unchanged when it is full', () => {
    const full = Array.from({ length: MAX_COMPARE }, (_, index) => `p${index}`);
    // Unchanged, so the caller can tell nothing happened and say so. Silently
    // swallowing the fifth tick is how a control stops looking like it works.
    expect(toggleCompareSlug(full, 'extra')).toEqual(full);
  });

  it('still removes when the list is full', () => {
    const full = Array.from({ length: MAX_COMPARE }, (_, index) => `p${index}`);
    expect(toggleCompareSlug(full, 'p0')).toHaveLength(MAX_COMPARE - 1);
  });
});

describe('compareHref', () => {
  it('builds a link the page can read back', () => {
    const href = compareHref(['a-phone', 'b-phone']);
    const query = new URLSearchParams(href.split('?')[1]);
    expect(parseCompareSlugs(query.get(COMPARE_PARAM))).toEqual(['a-phone', 'b-phone']);
  });
});

// ---------------------------------------------------------------------------

function product(
  slug: string,
  specs: Record<string, [label: string, value: string, order: number]>,
): ComparableProduct {
  return {
    slug,
    specs: new Map(
      Object.entries(specs).map(([key, [label, value]]) => [key, { label, value }]),
    ),
    order: new Map(Object.entries(specs).map(([key, [, , order]]) => [key, order])),
  };
}

describe('buildComparisonRows', () => {
  it('aligns every value to its own product', () => {
    const rows = buildComparisonRows([
      product('a', { ram: ['RAM', '8 GB', 1], battery: ['Battery', '5000 mAh', 2] }),
      product('b', { ram: ['RAM', '12 GB', 1], battery: ['Battery', '4500 mAh', 2] }),
    ]);

    expect(rows.map((row) => row.key)).toEqual(['ram', 'battery']);
    expect(rows[0]?.values).toEqual(['8 GB', '12 GB']);
    expect(rows[1]?.values).toEqual(['5000 mAh', '4500 mAh']);
  });

  it('takes the union, and marks the gaps', () => {
    // Different product types: a phone against a cable shares almost nothing,
    // and an intersection would render an empty page rather than an answer.
    const rows = buildComparisonRows([
      product('phone', { ram: ['RAM', '8 GB', 1] }),
      product('cable', { length: ['Length', '2 m', 1] }),
    ]);

    expect(rows.map((row) => row.key).sort()).toEqual(['length', 'ram']);
    expect(rows.find((row) => row.key === 'ram')?.values).toEqual(['8 GB', null]);
    expect(rows.find((row) => row.key === 'length')?.values).toEqual([null, '2 m']);
  });

  it('flags a row only when the products actually disagree', () => {
    const rows = buildComparisonRows([
      product('a', { ram: ['RAM', '8 GB', 1], nfc: ['NFC', 'Yes', 2] }),
      product('b', { ram: ['RAM', '8 GB', 1], nfc: ['NFC', 'No', 2] }),
    ]);

    expect(rows.find((row) => row.key === 'ram')?.differs).toBe(false);
    expect(rows.find((row) => row.key === 'nfc')?.differs).toBe(true);
  });

  it('does not treat a missing value as a difference', () => {
    // Missing information is not disagreement, and highlighting it as one
    // would point a shopper at the product that simply has fewer specs filled.
    const rows = buildComparisonRows([
      product('a', { ram: ['RAM', '8 GB', 1] }),
      product('b', {}),
    ]);

    expect(rows[0]?.values).toEqual(['8 GB', null]);
    expect(rows[0]?.differs).toBe(false);
  });

  it("orders by the earliest position any product's type gives a spec", () => {
    const rows = buildComparisonRows([
      product('a', { late: ['Late', 'x', 9] }),
      product('b', { late: ['Late', 'y', 2], early: ['Early', 'z', 1] }),
    ]);

    expect(rows.map((row) => row.key)).toEqual(['early', 'late']);
  });

  it('is empty for no products, rather than a table of nothing', () => {
    expect(buildComparisonRows([])).toEqual([]);
  });
});
