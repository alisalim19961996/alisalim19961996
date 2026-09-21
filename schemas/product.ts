import { z } from 'zod';
import { blankIsMissing } from '@/schemas/blank';
import { StockStatus } from '@prisma/client';
import { isValidSlug } from '@/lib/domain/product';

/**
 * Product editing input.
 *
 * The dashboard is staff-only, but a form is still a public HTTP endpoint and
 * a stale tab still sends yesterday's values, so everything is parsed here.
 *
 * Two of these rules exist as database CHECK constraints as well
 * (`comparePriceIqd > priceIqd`, non-empty variant labels). That is deliberate
 * duplication: Postgres is the guarantee, and this is the one that can answer
 * in Arabic with the offending field named instead of a 500.
 */

/** Error messages are keys under the `admin` namespace, never sentences. */
const required = 'required';

const text = (max: number) => z.string().trim().max(max, 'tooLong');
const requiredText = (max: number) => text(max).min(1, required);
const optionalText = (max: number) =>
  text(max)
    .optional()
    .transform((value) => (value ? value : null));

/** Whole dinars. A price is never a float anywhere in MPS (CLAUDE.md §13.1). */
const priceIqd = blankIsMissing(
  z.coerce
    .number({ error: required })
    .int('notWholeDinars')
    .min(0, 'negativeAmount')
    .max(1_000_000_000, 'amountTooLarge'),
);

/**
 * Where a product image may live.
 *
 * Exactly two places, because those are the two `next.config.ts` will render:
 * a path under `public/`, and an object in a Supabase Storage bucket. Any
 * other host passes no `remotePatterns` entry and fails at render time — and a
 * rule that lets the owner save something broken is worse than no rule.
 *
 * `.svg` is refused by name here as well as by content at upload
 * (`lib/domain/image-file.ts`): `dangerouslyAllowSVG` is off (CLAUDE.md §18)
 * because an SVG is a script delivered as a picture, and a path typed by hand
 * never passes through the upload check at all.
 */
const SUPABASE_PUBLIC_OBJECT =
  /^https:\/\/[a-z0-9-]+\.supabase\.(?:co|in)\/storage\/v1\/object\/public\/\S+$/i;

const imagePath = z
  .string()
  .trim()
  .min(1, required)
  .max(500, 'tooLong')
  .refine(
    (value) => value.startsWith('/') || SUPABASE_PUBLIC_OBJECT.test(value),
    'imageMustBeLocal',
  )
  .refine((value) => !/\.svgz?($|\?)/i.test(value), 'imageSvgRefused');

const optionalImagePath = z
  .union([z.literal(''), imagePath])
  .optional()
  .transform((value) => (value ? value : null));

/** Free-text lists (key features, pros, cons). Blank lines are dropped. */
const bulletList = z
  .array(z.string().trim().max(300, 'tooLong'))
  .max(20, 'tooManyItems')
  .default([])
  .transform((items) => items.filter((item) => item !== ''));

const productOptionValueSchema = z.object({
  valueAr: requiredText(60),
  valueEn: requiredText(60),
  /** Swatch colour. Only meaningful when the option is a colour. */
  hex: z
    .union([z.literal(''), z.string().regex(/^#[0-9a-fA-F]{6}$/, 'invalidHex')])
    .optional()
    .transform((value) => (value ? value : null)),
});

const productOptionSchema = z.object({
  nameAr: requiredText(60),
  nameEn: requiredText(60),
  isColor: z.boolean().default(false),
  values: z.array(productOptionValueSchema).min(1, 'optionNeedsValue').max(30),
});

const variantSchema = z.object({
  /** Stable across edits, so carts and orders keep pointing at the same row. */
  id: z.string().optional(),
  sku: z
    .string()
    .trim()
    .min(1, required)
    .max(64, 'tooLong')
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'invalidSku'),
  priceIqd,
  // Empty and zero differ: empty means "no was-price", zero would advertise a
  // 100% discount.
  comparePriceIqd: z
    .union([z.literal(''), priceIqd])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
  /** One `valueEn` per declared option, in option order. */
  optionValues: z.array(z.string().trim()).max(5).default([]),
  /** Used when the product has no options; otherwise derived from the values. */
  labelAr: optionalText(120),
  labelEn: optionalText(120),
  imageUrl: optionalImagePath,
  status: z.enum(StockStatus).default(StockStatus.IN_STOCK),
  isActive: z.boolean().default(true),
});

export const productFormSchema = z
  .object({
    // -- Identity ----------------------------------------------------------
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, required)
      .refine(isValidSlug, 'invalidSlug'),
    nameAr: requiredText(160),
    nameEn: requiredText(160),
    taglineAr: optionalText(200),
    taglineEn: optionalText(200),

    // -- Taxonomy ----------------------------------------------------------
    productTypeId: z.string().min(1, required),
    brandId: z.string().min(1, required),
    categoryId: z.string().min(1, required),

    // -- Merchandising -----------------------------------------------------
    isPublished: z.boolean().default(false),
    isFeatured: z.boolean().default(false),
    isNewArrival: z.boolean().default(false),
    isBestSeller: z.boolean().default(false),

    // -- Warranty ----------------------------------------------------------
    // The default lives INSIDE the preprocess: `.default()` looks at the raw
    // input, which is `''` and not undefined, so a default wrapped around the
    // outside never fires and the field fails as NaN instead.
    warrantyMonths: blankIsMissing(z.coerce.number().int().min(0).max(120).default(12)),
    warrantyNoteAr: optionalText(2000),
    warrantyNoteEn: optionalText(2000),

    // -- Long-form content -------------------------------------------------
    overviewAr: optionalText(4000),
    overviewEn: optionalText(4000),
    keyFeaturesAr: bulletList,
    keyFeaturesEn: bulletList,
    prosAr: bulletList,
    prosEn: bulletList,
    consAr: bulletList,
    consEn: bulletList,
    whoIsItForAr: optionalText(1000),
    whoIsItForEn: optionalText(1000),
    thingsToKnowAr: optionalText(1000),
    thingsToKnowEn: optionalText(1000),

    // -- SEO ---------------------------------------------------------------
    metaTitleAr: optionalText(160),
    metaTitleEn: optionalText(160),
    metaDescriptionAr: optionalText(300),
    metaDescriptionEn: optionalText(300),

    /**
     * Specifications, keyed by `AttributeDefinition.key`.
     *
     * Raw strings on purpose: which column each one lands in is decided by the
     * definition's own `type`, in `lib/domain/product.ts`, not by a shape
     * hard-coded here. That is what keeps a new product type data entry.
     */
    attributes: z.record(z.string(), z.string()).default({}),

    options: z.array(productOptionSchema).max(5, 'tooManyOptions').default([]),
    variants: z.array(variantSchema).min(1, 'needsOneVariant').max(60),

    images: z
      .array(
        z.object({
          url: imagePath,
          altAr: optionalText(200),
          altEn: optionalText(200),
        }),
      )
      .max(12, 'tooManyItems')
      .default([]),

    videos: z
      .array(
        z.object({
          url: z.string().trim().min(1, required).max(500, 'tooLong'),
          titleAr: optionalText(160),
          titleEn: optionalText(160),
        }),
      )
      .max(6, 'tooManyItems')
      .default([]),
  })
  .superRefine((data, ctx) => {
    // -- One SKU is one variant, forever ------------------------------------
    // The database enforces this globally; catching it here names the row.
    const seenSkus = new Set<string>();
    data.variants.forEach((variant, index) => {
      const sku = variant.sku.toUpperCase();
      if (seenSkus.has(sku)) {
        ctx.addIssue({
          code: 'custom',
          message: 'duplicateSku',
          path: ['variants', index, 'sku'],
        });
      }
      seenSkus.add(sku);

      // A "was" price that is not higher is a fake discount (CHECK constraint
      // `comparePriceIqd > priceIqd`).
      const compare = variant.comparePriceIqd;
      if (compare !== null && compare <= variant.priceIqd) {
        ctx.addIssue({
          code: 'custom',
          message: 'comparePriceTooLow',
          path: ['variants', index, 'comparePriceIqd'],
        });
      }
    });

    // -- Option names are what variants select by ---------------------------
    const seenOptionNames = new Set<string>();
    data.options.forEach((option, index) => {
      const key = option.nameEn.toLowerCase();
      if (seenOptionNames.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: 'duplicateOption',
          path: ['options', index, 'nameEn'],
        });
      }
      seenOptionNames.add(key);

      const seenValues = new Set<string>();
      option.values.forEach((value, valueIndex) => {
        const valueKey = value.valueEn.toLowerCase();
        if (seenValues.has(valueKey)) {
          ctx.addIssue({
            code: 'custom',
            message: 'duplicateOptionValue',
            path: ['options', index, 'values', valueIndex, 'valueEn'],
          });
        }
        seenValues.add(valueKey);
      });
    });

    // -- Every variant answers every option ---------------------------------
    // A variant missing a selection cannot be reached by the storefront's
    // picker: it would be permanently invisible and permanently unbuyable.
    data.variants.forEach((variant, index) => {
      if (data.options.length === 0) {
        if (!variant.labelAr || !variant.labelEn) {
          ctx.addIssue({
            code: 'custom',
            message: 'variantNeedsLabel',
            path: ['variants', index, 'labelEn'],
          });
        }
        return;
      }

      if (variant.optionValues.length !== data.options.length) {
        ctx.addIssue({
          code: 'custom',
          message: 'variantMissingOption',
          path: ['variants', index, 'optionValues'],
        });
        return;
      }

      variant.optionValues.forEach((chosen, optionIndex) => {
        const option = data.options[optionIndex];
        if (!option?.values.some((value) => value.valueEn === chosen)) {
          ctx.addIssue({
            code: 'custom',
            message: 'variantUnknownOptionValue',
            path: ['variants', index, 'optionValues', optionIndex],
          });
        }
      });
    });

    // -- Two variants cannot be the same combination ------------------------
    const seenCombinations = new Set<string>();
    data.variants.forEach((variant, index) => {
      if (data.options.length === 0) return;
      const key = JSON.stringify(variant.optionValues);
      if (seenCombinations.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: 'duplicateCombination',
          path: ['variants', index, 'optionValues'],
        });
      }
      seenCombinations.add(key);
    });
  });

export const adminProductFilterSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  type: z.string().trim().max(60).optional().catch(undefined),
  status: z.enum(['published', 'draft']).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export type ProductFormInput = z.infer<typeof productFormSchema>;
export type ProductOptionInput = z.infer<typeof productOptionSchema>;
export type ProductVariantInput = z.infer<typeof variantSchema>;
export type AdminProductFilter = z.infer<typeof adminProductFilterSchema>;
