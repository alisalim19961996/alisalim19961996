import { AttributeDataType } from '@prisma/client';

/**
 * Product editing rules, kept free of Next and Prisma runtime.
 *
 * The dashboard's product form is *generated* from `ProductTypeAttribute`
 * rather than written per product type (CLAUDE.md §6) — adding "laptops" has
 * to stay data entry. That only works if one function decides how a typed
 * attribute is read and written; a switch in the service, a second in the
 * query and a third in the form is how the three start disagreeing about what
 * "8" means.
 *
 * Everything here is pure, so it is unit-tested without a database.
 */

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

/**
 * Build the latin slug used by *both* locales.
 *
 * §6: one slug in `slugAr` and `slugEn`, so `/ar/products/<slug>` and
 * `/en/products/<slug>` stay stable for hreflang. It is derived from the
 * English name because an Arabic slug would be percent-encoded into
 * unreadable bytes in every link, log and share sheet.
 *
 * Returns '' when there is nothing latin to work with — the caller asks for a
 * slug rather than inventing one, because a transliteration nobody chose is a
 * URL nobody can predict.
 */
export function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      // Strip combining marks left behind by NFKD (é → e).
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      // A trailing dash can survive the slice.
      .replace(/-+$/, '')
  );
}

/** Slugs are compared and stored in this shape, so validation uses one rule. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80;
}

// ---------------------------------------------------------------------------
// Attribute values
// ---------------------------------------------------------------------------

/**
 * The five typed columns on `ProductAttributeValue`, exactly one of which is
 * used for any given attribute. `optionValue` is the `AttributeOption.value`
 * string; the service resolves it to a row id, because a form cannot be
 * trusted to send a database id.
 */
export interface AttributeColumns {
  valueInt: number | null;
  valueDecimal: number | null;
  valueText: string | null;
  valueBool: boolean | null;
  optionValue: string | null;
}

export const EMPTY_ATTRIBUTE_COLUMNS: AttributeColumns = {
  valueInt: null,
  valueDecimal: null,
  valueText: null,
  valueBool: null,
  optionValue: null,
};

/** Error keys live under the `admin` namespace in messages/, never sentences. */
export type AttributeErrorKey =
  | 'attrRequired'
  | 'attrNotANumber'
  | 'attrNotAnInteger'
  | 'attrUnknownOption'
  | 'attrTooLong';

export type AttributeParseResult =
  | { ok: true; columns: AttributeColumns | null }
  | { ok: false; errorKey: AttributeErrorKey };

/** Beyond this a "specification" is an article, and belongs in the overview. */
const MAX_TEXT_ATTRIBUTE = 200;

/**
 * Read one form field into the column its definition dictates.
 *
 * A blank optional attribute resolves to `columns: null`, which the service
 * reads as "delete this row" — an absent specification and a specification
 * recorded as empty are different things, and only the first one hides the
 * row from the product page.
 */
export function parseAttributeValue(options: {
  type: AttributeDataType;
  raw: string;
  isRequired: boolean;
  /** Allowed `AttributeOption.value` strings. Only consulted for ENUM. */
  allowedOptions?: readonly string[];
}): AttributeParseResult {
  const { type, isRequired, allowedOptions = [] } = options;
  const raw = options.raw.trim();

  if (raw === '') {
    if (isRequired) return { ok: false, errorKey: 'attrRequired' };
    return { ok: true, columns: null };
  }

  switch (type) {
    case AttributeDataType.INT: {
      // Number('') is 0 and Number('8mm') is NaN — the first is why the blank
      // case is handled above, the second is why this check is explicit.
      const value = Number(raw);
      if (!Number.isFinite(value)) return { ok: false, errorKey: 'attrNotANumber' };
      if (!Number.isInteger(value)) return { ok: false, errorKey: 'attrNotAnInteger' };
      return { ok: true, columns: { ...EMPTY_ATTRIBUTE_COLUMNS, valueInt: value } };
    }

    case AttributeDataType.DECIMAL: {
      const value = Number(raw);
      if (!Number.isFinite(value)) return { ok: false, errorKey: 'attrNotANumber' };
      return { ok: true, columns: { ...EMPTY_ATTRIBUTE_COLUMNS, valueDecimal: value } };
    }

    case AttributeDataType.BOOLEAN:
      return {
        ok: true,
        columns: { ...EMPTY_ATTRIBUTE_COLUMNS, valueBool: isTruthyInput(raw) },
      };

    case AttributeDataType.ENUM: {
      if (!allowedOptions.includes(raw)) {
        return { ok: false, errorKey: 'attrUnknownOption' };
      }
      return { ok: true, columns: { ...EMPTY_ATTRIBUTE_COLUMNS, optionValue: raw } };
    }

    case AttributeDataType.TEXT:
      if (raw.length > MAX_TEXT_ATTRIBUTE) {
        return { ok: false, errorKey: 'attrTooLong' };
      }
      return { ok: true, columns: { ...EMPTY_ATTRIBUTE_COLUMNS, valueText: raw } };
  }
}

/** Checkbox and select transports both end up here, so both are accepted. */
function isTruthyInput(raw: string): boolean {
  const normalized = raw.toLowerCase();
  return normalized === 'true' || normalized === 'on' || normalized === '1';
}

/**
 * Turn a stored value back into the string the form field shows.
 *
 * The inverse of `parseAttributeValue`, and deliberately adjacent to it: an
 * edit form that cannot round-trip its own output silently drops a
 * specification the moment somebody saves without touching it.
 */
export function attributeValueToFormString(
  type: AttributeDataType,
  columns: Partial<AttributeColumns>,
): string {
  switch (type) {
    case AttributeDataType.INT:
      return columns.valueInt == null ? '' : String(columns.valueInt);
    case AttributeDataType.DECIMAL:
      return columns.valueDecimal == null ? '' : String(columns.valueDecimal);
    case AttributeDataType.BOOLEAN:
      return columns.valueBool == null ? '' : String(columns.valueBool);
    case AttributeDataType.ENUM:
      return columns.optionValue ?? '';
    case AttributeDataType.TEXT:
      return columns.valueText ?? '';
  }
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

/**
 * The label carried into carts, orders and invoices, e.g. "256GB / Black".
 *
 * Denormalised onto the variant so an order line renders without joining three
 * tables, and snapshotted again onto `OrderItem` so last week's invoice does
 * not change when the product is edited.
 */
export function buildVariantLabel(values: readonly string[]): string {
  return values
    .map((value) => value.trim())
    .filter((value) => value !== '')
    .join(' / ');
}

export interface PricedVariant {
  priceIqd: number;
  isActive: boolean;
}

/**
 * The figure `Product.minPriceIqd` caches.
 *
 * Denormalised so catalogue sorting and price filtering stay one indexed
 * query, which means it has to be recomputed on every variant write — a stale
 * value sorts a product into the wrong price bracket and filters it out of a
 * range it belongs in.
 *
 * Inactive variants are excluded: a shopper cannot buy one, so advertising its
 * price is a bait price.
 */
export function cheapestActivePrice(variants: readonly PricedVariant[]): number | null {
  const prices = variants
    .filter((variant) => variant.isActive)
    .map((variant) => variant.priceIqd);
  return prices.length === 0 ? null : Math.min(...prices);
}

/**
 * Every combination of the given option values, in option order.
 *
 * A phone with three storage sizes and four colours has twelve variants, and
 * typing them out by hand is how one gets forgotten — the missing combination
 * is then unbuyable, and nothing in the storefront says why.
 */
export function optionCombinations(
  valuesPerOption: readonly (readonly string[])[],
): string[][] {
  if (valuesPerOption.length === 0) return [];

  return valuesPerOption.reduce<string[][]>(
    (combinations, values) =>
      combinations.flatMap((combination) =>
        values.map((value) => [...combination, value]),
      ),
    [[]],
  );
}

/**
 * A first-draft SKU, which the owner is free to overwrite.
 *
 * Suggested rather than enforced: a store that already prints its own SKUs on
 * the shelf labels needs those, not ours. Uppercase ASCII only, because a SKU
 * is read aloud to a courier and typed into a search box.
 */
export function suggestSku(base: string, values: readonly string[]): string {
  const parts = [base, ...values]
    .map((part) =>
      part
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter((part) => part !== '');

  return parts.join('-').slice(0, 64).replace(/-+$/, '');
}

/**
 * The swatch a new colour option starts on.
 *
 * A `<input type="color">` has no empty state — handed an empty string it
 * falls back to black, which reads as a deliberate choice the owner never
 * made. A neutral grey says "not picked yet". This is the initial value of a
 * data column, not a design token, which is why it lives here and not in
 * `@theme`.
 */
export const DEFAULT_SWATCH_HEX = '#cccccc';
