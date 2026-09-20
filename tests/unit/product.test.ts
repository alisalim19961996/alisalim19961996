import { describe, expect, it } from 'vitest';
import { AttributeDataType } from '@prisma/client';
import {
  attributeValueToFormString,
  buildVariantLabel,
  cheapestActivePrice,
  isValidSlug,
  optionCombinations,
  parseAttributeValue,
  slugify,
  suggestSku,
} from '@/lib/domain/product';
import { productFormSchema } from '@/schemas/product';

/**
 * The dashboard's product form is generated from the attribute tables, so
 * these functions are the whole difference between "adding laptops is data
 * entry" and "adding laptops is a pull request".
 */

describe('slugify', () => {
  it('builds a url-safe slug from an English name', () => {
    expect(slugify('Galaxy S24 Ultra')).toBe('galaxy-s24-ultra');
  });

  it('strips accents rather than percent-encoding them', () => {
    expect(slugify('Café Édition')).toBe('cafe-edition');
  });

  it('collapses punctuation and trims stray dashes', () => {
    expect(slugify('  TECNO —— Camon 30 (Pro)!  ')).toBe('tecno-camon-30-pro');
  });

  it('returns empty for a name with nothing latin in it', () => {
    // The caller asks the owner for a slug instead of inventing a
    // transliteration nobody chose and no one can predict.
    expect(slugify('سامسونج جالكسي')).toBe('');
  });

  it('never emits a trailing dash after truncation', () => {
    const slug = slugify(`${'a'.repeat(79)} tail`);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.length).toBeLessThanOrEqual(80);
  });
});

describe('isValidSlug', () => {
  it.each(['galaxy-s24', 'a', 'x1-y2-z3'])('accepts %s', (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each(['-leading', 'trailing-', 'double--dash', 'Upper', 'has space', 'عربي', ''])(
    'rejects %s',
    (slug) => {
      expect(isValidSlug(slug)).toBe(false);
    },
  );
});

describe('parseAttributeValue', () => {
  const parse = (type: AttributeDataType, raw: string, isRequired = false) =>
    parseAttributeValue({ type, raw, isRequired, allowedOptions: ['amoled', 'lcd'] });

  it('routes an integer to valueInt and leaves the other columns null', () => {
    const result = parse(AttributeDataType.INT, '8');
    expect(result).toEqual({
      ok: true,
      columns: {
        valueInt: 8,
        valueDecimal: null,
        valueText: null,
        valueBool: null,
        optionValue: null,
      },
    });
  });

  it('rejects a decimal offered to an INT rather than rounding it', () => {
    // Rounding would turn "6.5 inch" silently into a 6 inch screen.
    expect(parse(AttributeDataType.INT, '6.5')).toEqual({
      ok: false,
      errorKey: 'attrNotAnInteger',
    });
  });

  it('rejects a value with a unit glued onto it', () => {
    // Units live in AttributeDefinition.unit and are never baked into a value.
    expect(parse(AttributeDataType.INT, '8GB')).toEqual({
      ok: false,
      errorKey: 'attrNotANumber',
    });
  });

  it('keeps a fraction for DECIMAL', () => {
    const result = parse(AttributeDataType.DECIMAL, '6.78');
    expect(result.ok && result.columns?.valueDecimal).toBe(6.78);
  });

  it('accepts an allowed ENUM option and refuses anything else', () => {
    const good = parse(AttributeDataType.ENUM, 'amoled');
    expect(good.ok && good.columns?.optionValue).toBe('amoled');

    expect(parse(AttributeDataType.ENUM, 'plasma')).toEqual({
      ok: false,
      errorKey: 'attrUnknownOption',
    });
  });

  it.each([
    ['true', true],
    ['on', true],
    ['1', true],
    ['false', false],
    ['anything else', false],
  ])('reads %s as the boolean %s', (raw, expected) => {
    const result = parse(AttributeDataType.BOOLEAN, raw);
    expect(result.ok && result.columns?.valueBool).toBe(expected);
  });

  it('caps a TEXT specification before it becomes an article', () => {
    expect(parse(AttributeDataType.TEXT, 'x'.repeat(201))).toEqual({
      ok: false,
      errorKey: 'attrTooLong',
    });
  });

  it('treats a blank optional attribute as "no row", not as an empty value', () => {
    // An absent specification is hidden on the product page; one stored as an
    // empty string renders a row with nothing in it.
    expect(parse(AttributeDataType.TEXT, '   ')).toEqual({ ok: true, columns: null });
  });

  it('refuses a blank required attribute', () => {
    expect(parse(AttributeDataType.INT, '', true)).toEqual({
      ok: false,
      errorKey: 'attrRequired',
    });
  });
});

describe('attributeValueToFormString', () => {
  it.each([
    [AttributeDataType.INT, { valueInt: 12 }, '12'],
    [AttributeDataType.DECIMAL, { valueDecimal: 6.5 }, '6.5'],
    [AttributeDataType.TEXT, { valueText: 'Gorilla Glass' }, 'Gorilla Glass'],
    [AttributeDataType.BOOLEAN, { valueBool: false }, 'false'],
    [AttributeDataType.ENUM, { optionValue: 'amoled' }, 'amoled'],
  ])('renders a stored %s back into the form', (type, columns, expected) => {
    expect(attributeValueToFormString(type, columns)).toBe(expected);
  });

  it('renders an unset value as an empty field, in every type', () => {
    for (const type of Object.values(AttributeDataType)) {
      expect(attributeValueToFormString(type, {})).toBe('');
    }
  });

  it('round-trips every parsed value back to the string it came from', () => {
    // An edit form that cannot round-trip its own output drops a
    // specification the moment somebody saves without touching it.
    const cases: [AttributeDataType, string][] = [
      [AttributeDataType.INT, '256'],
      [AttributeDataType.DECIMAL, '6.78'],
      [AttributeDataType.TEXT, 'IP68'],
      [AttributeDataType.BOOLEAN, 'true'],
      [AttributeDataType.ENUM, 'amoled'],
    ];

    for (const [type, raw] of cases) {
      const parsed = parseAttributeValue({
        type,
        raw,
        isRequired: false,
        allowedOptions: ['amoled'],
      });
      expect(parsed.ok).toBe(true);
      if (!parsed.ok || !parsed.columns) throw new Error('expected a value');
      expect(attributeValueToFormString(type, parsed.columns)).toBe(raw);
    }
  });
});

describe('buildVariantLabel', () => {
  it('joins the chosen option values the way an invoice reads', () => {
    expect(buildVariantLabel(['256GB', 'Black'])).toBe('256GB / Black');
  });

  it('skips a blank selection instead of leaving a dangling separator', () => {
    expect(buildVariantLabel(['256GB', '  ', 'Black'])).toBe('256GB / Black');
  });

  it('returns empty when a product has no options at all', () => {
    // The caller falls back to a typed label — the database CHECK forbids an
    // empty variant label.
    expect(buildVariantLabel([])).toBe('');
  });
});

describe('cheapestActivePrice', () => {
  it('is the lowest price a shopper can actually pay', () => {
    expect(
      cheapestActivePrice([
        { priceIqd: 500_000, isActive: true },
        { priceIqd: 300_000, isActive: true },
      ]),
    ).toBe(300_000);
  });

  it('ignores an inactive variant, however cheap', () => {
    // Advertising a price nobody can buy is a bait price.
    expect(
      cheapestActivePrice([
        { priceIqd: 500_000, isActive: true },
        { priceIqd: 1_000, isActive: false },
      ]),
    ).toBe(500_000);
  });

  it('is null when nothing is on sale, so the catalogue shows no price', () => {
    expect(cheapestActivePrice([{ priceIqd: 1_000, isActive: false }])).toBeNull();
    expect(cheapestActivePrice([])).toBeNull();
  });
});

describe('optionCombinations', () => {
  it('produces every combination in option order', () => {
    expect(
      optionCombinations([
        ['128GB', '256GB'],
        ['Black', 'Blue'],
      ]),
    ).toEqual([
      ['128GB', 'Black'],
      ['128GB', 'Blue'],
      ['256GB', 'Black'],
      ['256GB', 'Blue'],
    ]);
  });

  it('handles a single option', () => {
    expect(optionCombinations([['S', 'M']])).toEqual([['S'], ['M']]);
  });

  it('is empty when there are no options, not a single empty variant', () => {
    // A product with no options has exactly one variant, and the owner names
    // it — generating a blank combination would create a nameless row.
    expect(optionCombinations([])).toEqual([]);
  });
});

describe('suggestSku', () => {
  it('builds an uppercase ASCII sku a courier can read aloud', () => {
    expect(suggestSku('galaxy-s24', ['256GB', 'Black'])).toBe('GALAXY-S24-256GB-BLACK');
  });

  it('drops anything that is not ASCII alphanumeric', () => {
    expect(suggestSku('camon 30', ['أسود'])).toBe('CAMON-30');
  });

  it('never ends in a separator, even after truncation', () => {
    const sku = suggestSku('a'.repeat(63), ['black']);
    expect(sku.length).toBeLessThanOrEqual(64);
    expect(sku.endsWith('-')).toBe(false);
  });
});

/**
 * An empty input is missing, not zero.
 *
 * `z.coerce.number()` runs `Number(value)` and `Number('')` is 0, so clearing
 * the price box made the variant free and clearing the warranty box made it a
 * zero-month warranty. Both saved without a word: the value is a valid number,
 * and nothing distinguishes "the owner deleted this" from "the owner typed 0".
 */
describe('a cleared number field', () => {
  const base = {
    slug: 'blank-test',
    nameAr: 'اختبار',
    nameEn: 'Blank test',
    productTypeId: 't',
    brandId: 'b',
    categoryId: 'c',
    attributes: {},
    options: [],
    images: [],
    videos: [],
    variants: [
      {
        sku: 'BLANK-1',
        priceIqd: '250000',
        optionValues: [],
        // No options, so the variant carries its own label.
        labelAr: 'أساسي',
        labelEn: 'Standard',
        status: 'IN_STOCK',
        isActive: true,
      },
    ],
  };

  it('refuses an empty price rather than making the variant free', () => {
    const parsed = productFormSchema.safeParse({
      ...base,
      variants: [{ ...base.variants[0], priceIqd: '' }],
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(['variants', 0, 'priceIqd']);
    }
  });

  it('refuses a price of only whitespace, which is what a half-cleared box leaves', () => {
    const parsed = productFormSchema.safeParse({
      ...base,
      variants: [{ ...base.variants[0], priceIqd: '   ' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('still accepts a deliberate zero, because free is a real price', () => {
    const parsed = productFormSchema.safeParse({
      ...base,
      variants: [{ ...base.variants[0], priceIqd: '0' }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.variants[0]?.priceIqd).toBe(0);
  });

  it('falls back to the default warranty when the box is cleared', () => {
    const cleared = productFormSchema.safeParse({ ...base, warrantyMonths: '' });
    expect(cleared.success).toBe(true);
    if (cleared.success) expect(cleared.data.warrantyMonths).toBe(12);
  });

  it('keeps a deliberate zero-month warranty, which is a real answer', () => {
    const zero = productFormSchema.safeParse({ ...base, warrantyMonths: '0' });
    expect(zero.success).toBe(true);
    if (zero.success) expect(zero.data.warrantyMonths).toBe(0);
  });
});
