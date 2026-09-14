import { z } from 'zod';
import { AttributeDataType } from '@prisma/client';
import { isValidSlug } from '@/lib/domain/product';
import { isValidAccentColor, isValidKey } from '@/lib/domain/taxonomy';

/**
 * Input for the screens that shape the catalogue: brands, categories, product
 * types and the attribute definitions a product type is assembled from.
 *
 * Parsed here for the same reason as `schemas/product.ts`: staff-only is not
 * the same as trusted, a stale tab sends yesterday's values, and a Server
 * Action is a public endpoint whatever page it was rendered on.
 */

/** Error messages are keys under the `admin` namespace, never sentences. */
const required = 'required';

const text = (max: number) => z.string().trim().max(max, 'tooLong');
const requiredText = (max: number) => text(max).min(1, required);
const optionalText = (max: number) =>
  text(max)
    .optional()
    .transform((value) => (value ? value : null));

/**
 * A URL for a logo or a category image.
 *
 * Same two homes as a product image and for the same reason
 * (`schemas/product.ts`): only a path under `public/` and a Supabase Storage
 * object match `next.config.ts`'s `remotePatterns`, so anything else saves
 * cleanly and then fails at render. SVG is refused by name because
 * `dangerouslyAllowSVG` is off (CLAUDE.md §18) and a hand-typed path never
 * passes the upload check that reads the bytes.
 */
const SUPABASE_PUBLIC_OBJECT =
  /^https:\/\/[a-z0-9-]+\.supabase\.(?:co|in)\/storage\/v1\/object\/public\/\S+$/i;

const optionalImageUrl = z
  .union([
    z.literal(''),
    z
      .string()
      .trim()
      .max(500, 'tooLong')
      .refine(
        (value) => value.startsWith('/') || SUPABASE_PUBLIC_OBJECT.test(value),
        'imageMustBeLocal',
      )
      .refine((value) => !/\.svgz?($|\?)/i.test(value), 'imageSvgRefused'),
  ])
  .optional()
  .transform((value) => (value ? value : null));

const sortOrder = z.coerce.number().int('notWhole').min(0).max(9999).default(0);

const key = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, required)
  .refine(isValidKey, 'invalidKey');

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, required)
  .refine(isValidSlug, 'invalidSlug');

// ---------------------------------------------------------------------------

export const brandFormSchema = z.object({
  slug,
  nameAr: requiredText(80),
  nameEn: requiredText(80),
  descriptionAr: optionalText(600),
  descriptionEn: optionalText(600),
  logoUrl: optionalImageUrl,
  /**
   * The one hex a component may carry, and it is data rather than design: it
   * differs per row and is only ever painted as a small identity dot (§10).
   */
  accentColor: z
    .union([z.literal(''), z.string().trim().refine(isValidAccentColor, 'invalidHex')])
    .optional()
    .transform((value) => (value ? value : null)),
  isActive: z.boolean().default(true),
  sortOrder,
});

export type BrandFormInput = z.infer<typeof brandFormSchema>;

// ---------------------------------------------------------------------------

export const categoryFormSchema = z.object({
  slug,
  nameAr: requiredText(80),
  nameEn: requiredText(80),
  descriptionAr: optionalText(600),
  descriptionEn: optionalText(600),
  imageUrl: optionalImageUrl,
  /** '' means "a top-level category", which is not the same as "unchanged". */
  parentId: z
    .string()
    .optional()
    .transform((value) => (value ? value : null)),
  isActive: z.boolean().default(true),
  sortOrder,
});

export type CategoryFormInput = z.infer<typeof categoryFormSchema>;

// ---------------------------------------------------------------------------

/**
 * One specification the product type asks for.
 *
 * The link, not the definition: the definition is shared, so the same "RAM"
 * row can be required on phones and optional on tablets.
 */
const productTypeAttributeSchema = z.object({
  definitionId: z.string().min(1, required),
  isRequired: z.boolean().default(false),
  sortOrder,
});

export const productTypeFormSchema = z.object({
  key,
  nameAr: requiredText(80),
  nameEn: requiredText(80),
  /** A lucide icon name. Unknown names fall back rather than crash. */
  icon: optionalText(40),
  isActive: z.boolean().default(true),
  sortOrder,
  attributes: z.array(productTypeAttributeSchema).max(60, 'tooManyItems').default([]),
});

export type ProductTypeFormInput = z.infer<typeof productTypeFormSchema>;

// ---------------------------------------------------------------------------

const attributeOptionSchema = z.object({
  value: z.string().trim().max(60),
  labelAr: z.string().trim().max(80),
  labelEn: z.string().trim().max(80),
});

export const attributeFormSchema = z
  .object({
    key,
    labelAr: requiredText(80),
    labelEn: requiredText(80),
    type: z.enum(AttributeDataType),
    /** Rendered after the value — "GB", "mAh". Never baked into the value. */
    unit: optionalText(20),
    groupId: z
      .string()
      .optional()
      .transform((value) => (value ? value : null)),
    isFilterable: z.boolean().default(false),
    isComparable: z.boolean().default(true),
    sortOrder,
    options: z.array(attributeOptionSchema).max(60, 'tooManyItems').default([]),
  })
  .superRefine((value, ctx) => {
    // An ENUM with no choices renders as an empty dropdown on every product
    // of every type that links it — a field nobody can fill and nothing
    // explains.
    const filled = value.options.filter((option) => option.value.trim() !== '');
    if (value.type === AttributeDataType.ENUM && filled.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'enumNeedsOptions',
      });
    }
  });

export type AttributeFormInput = z.infer<typeof attributeFormSchema>;

/** Every data type, for the `<select>` — ordered as the owner meets them. */
export const ATTRIBUTE_TYPE_VALUES = [
  AttributeDataType.TEXT,
  AttributeDataType.INT,
  AttributeDataType.DECIMAL,
  AttributeDataType.BOOLEAN,
  AttributeDataType.ENUM,
] as const;
