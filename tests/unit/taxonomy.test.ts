/**
 * The rules that make "adding laptops is data entry" true.
 *
 * The category tree is the part worth testing hardest: `parentId` arrives from
 * a form, so a cycle is a thing a person can create, and the naive walk
 * recurses until the server's stack gives out.
 */
import { describe, expect, it } from 'vitest';
import {
  collidingField,
  descendantIds,
  flattenTree,
  isValidAccentColor,
  isValidKey,
  keyify,
  normaliseOptions,
  normaliseSortOrder,
} from '@/lib/domain/taxonomy';

describe('keys', () => {
  it('accepts the shapes the seed already uses', () => {
    for (const key of ['phone', 'screen_size', 'ram', 'battery_mah', 'x1']) {
      expect(isValidKey(key), key).toBe(true);
    }
  });

  it.each([
    ['', 'empty'],
    ['Phone', 'uppercase'],
    ['1phone', 'leading digit'],
    ['screen-size', 'dash'],
    ['screen size', 'space'],
    ['شاشة', 'arabic'],
    ['a'.repeat(61), 'too long'],
  ])('rejects %s (%s)', (key) => {
    expect(isValidKey(key)).toBe(false);
  });

  it('derives a key from a latin name', () => {
    expect(keyify('Screen Size')).toBe('screen_size');
    expect(keyify('Battery (mAh)')).toBe('battery_mah');
    expect(keyify('  Laptop  ')).toBe('laptop');
  });

  it('produces a valid key or nothing at all', () => {
    for (const name of ['Screen Size', '4K Display', 'حجم الشاشة', '', '---']) {
      const key = keyify(name);
      expect(key === '' || isValidKey(key), `${name} -> ${key}`).toBe(true);
    }
  });
});

describe('accent colour', () => {
  it('accepts a six-digit hex in either case', () => {
    expect(isValidAccentColor('#1428A0')).toBe(true);
    expect(isValidAccentColor('#1428a0')).toBe(true);
  });

  it.each(['1428A0', '#1428A', '#12345', '#1428A0F', 'red', ''])(
    'rejects %s',
    (value) => {
      expect(isValidAccentColor(value)).toBe(false);
    },
  );
});

describe('category tree', () => {
  const tree = [
    { id: 'phones', parentId: null },
    { id: 'flagship', parentId: 'phones' },
    { id: 'gaming', parentId: 'phones' },
    { id: 'accessories', parentId: null },
    { id: 'cables', parentId: 'accessories' },
  ];

  it('reads depth-first with a depth for each row', () => {
    expect(flattenTree(tree).map((r) => [r.node.id, r.depth])).toEqual([
      ['phones', 0],
      ['flagship', 1],
      ['gaming', 1],
      ['accessories', 0],
      ['cables', 1],
    ]);
  });

  it('keeps a child whose parent is not in the list, as a root', () => {
    const orphan = [{ id: 'cables', parentId: 'accessories' }];
    expect(flattenTree(orphan).map((r) => [r.node.id, r.depth])).toEqual([
      ['cables', 0],
    ]);
  });

  it('terminates on a cycle instead of recursing forever', () => {
    // Two categories each claiming the other as a parent: reachable from no
    // root, so a naive walk emits nothing and a recursive one never returns.
    const cyclic = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
      { id: 'root', parentId: null },
    ];
    const ids = flattenTree(cyclic).map((r) => r.node.id);
    expect(ids).toContain('root');
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).toHaveLength(3);
  });

  it('sorts siblings with the comparator it is given', () => {
    const byIdDesc = (a: { id: string }, b: { id: string }) => b.id.localeCompare(a.id);
    expect(flattenTree(tree, byIdDesc).map((r) => r.node.id)).toEqual([
      'phones',
      'gaming',
      'flagship',
      'accessories',
      'cables',
    ]);
  });

  it('names a category and everything under it as illegal parents', () => {
    expect([...descendantIds(tree, 'phones')].sort()).toEqual([
      'flagship',
      'gaming',
      'phones',
    ]);
  });

  it('finds descendants through more than one level', () => {
    const deep = [
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: 'b' },
      { id: 'd', parentId: 'c' },
    ];
    expect(descendantIds(deep, 'a').size).toBe(4);
  });

  it('terminates when asked for descendants inside a cycle', () => {
    const cyclic = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect([...descendantIds(cyclic, 'a')].sort()).toEqual(['a', 'b']);
  });
});

describe('attribute options', () => {
  const row = (value: string, labelAr = '', labelEn = '') => ({
    value,
    labelAr,
    labelEn,
  });

  it('drops the editor’s spare blank row', () => {
    const result = normaliseOptions([row('amoled', 'أموليد', 'AMOLED'), row('')]);
    expect(result.ok && result.options).toHaveLength(1);
  });

  it('fills a missing label from the other language', () => {
    const result = normaliseOptions([row('amoled', '', 'AMOLED')]);
    expect(result.ok && result.options[0]).toEqual({
      value: 'amoled',
      labelAr: 'AMOLED',
      labelEn: 'AMOLED',
    });
  });

  it('names the row whose value is not key-shaped', () => {
    const result = normaliseOptions([row('AMOLED!', 'أموليد', 'AMOLED')]);
    expect(result).toMatchObject({ ok: false, error: 'optionValueInvalid' });
  });

  it('catches a duplicate before Postgres does, and names it', () => {
    const result = normaliseOptions([row('amoled'), row('amoled')]);
    expect(result).toMatchObject({
      ok: false,
      error: 'optionValueDuplicate',
      field: 'amoled',
    });
  });
});

describe('sort order', () => {
  it('renumbers to consecutive integers from zero', () => {
    expect(normaliseSortOrder([{ s: 10 }, { s: 20 }, { s: 30 }], (r) => r.s)).toEqual([
      0, 1, 2,
    ]);
  });

  it('breaks a tie by the order the rows arrived in', () => {
    // Three rows all at 0 is what a fresh form submits, and without this the
    // list reorders itself between visits.
    expect(normaliseSortOrder([{ s: 0 }, { s: 0 }, { s: 0 }], (r) => r.s)).toEqual([
      0, 1, 2,
    ]);
  });

  it('closes gaps while keeping the intended order', () => {
    expect(normaliseSortOrder([{ s: 5 }, { s: 1 }, { s: 9 }], (r) => r.s)).toEqual([
      1, 0, 2,
    ]);
  });
});

describe('which field a unique violation names', () => {
  /*
    The trap this exists for: Postgres calls the index on `Brand.slug`
    `brand_slug_key`, so a `constraint.includes('key')` check calls every
    duplicate slug a duplicate key and sends the owner to fix the wrong field.
    An integration test against a real database caught it — the index name only
    exists once Postgres has refused the write.
  */
  it.each([
    ['brand_slug_key', 'slug'],
    ['category_slug_key', 'slug'],
    ['product_slug_key', 'slug'],
    ['slug', 'slug'],
    ['product_type_key_key', 'key'],
    ['attribute_definition_key_key', 'key'],
    ['key', 'key'],
  ])('%s names the %s', (constraint, expected) => {
    expect(collidingField(constraint)).toBe(expected);
  });

  it('reads either half when the diagnosis recovered both', () => {
    // `diagnose.ts` joins whatever it could find: a column name from
    // `meta.target`, an index name from the driver adapter, or both.
    expect(collidingField('brand_slug_key,slug')).toBe('slug');
    expect(collidingField('slug,brand_slug_key')).toBe('slug');
  });

  it('says nothing when the constraint is about something else', () => {
    expect(collidingField('product_variant_sku_key')).toBeNull();
    expect(collidingField('')).toBeNull();
  });
});
