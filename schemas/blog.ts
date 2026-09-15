import { z } from 'zod';
import { isValidSlug } from '@/lib/domain/product';

/**
 * Input for the buying-guide editor.
 *
 * Parsed here for the same reason as every other admin form: staff-only is not
 * the same as trusted, a stale tab sends yesterday's values, and a Server
 * Action is a public endpoint whatever page it was rendered on.
 *
 * Error messages are keys under the `admin` namespace, never sentences.
 */

const required = 'required';

const text = (max: number) => z.string().trim().max(max, 'tooLong');
const requiredText = (max: number) => text(max).min(1, required);
const optionalText = (max: number) =>
  text(max)
    .optional()
    .transform((value) => (value ? value : null));

/**
 * One slug for both locales, exactly as products do it (§6).
 *
 * `/ar/guides/<slug>` and `/en/guides/<slug>` must stay the same URL in both
 * languages or hreflang has nothing to pair, and a slug that changes with the
 * language means every share of the Arabic article is a dead link in English.
 */
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, required)
  .max(120, 'tooLong')
  .refine(isValidSlug, 'invalidSlug');

/**
 * The article itself.
 *
 * A generous ceiling rather than none: this column is written by a form, and a
 * field with no limit is a way to fill a database one paste at a time. 40 000
 * characters is a very long buying guide.
 */
const body = z.string().trim().min(1, required).max(40_000, 'tooLong');

/**
 * When it goes live, as a date the owner picked.
 *
 * Empty means "now" and is filled in by the service, not here: a schema that
 * reaches for the clock gives a different answer every time it parses, which
 * makes it untestable and makes two saves of the same form differ.
 */
const publishedAt = z
  .union([z.literal(''), z.iso.datetime({ local: true }), z.iso.date()])
  .optional()
  .transform((value) => (value ? new Date(value) : null));

export const blogPostFormSchema = z.object({
  slug,
  titleAr: requiredText(180),
  titleEn: requiredText(180),
  excerptAr: optionalText(400),
  excerptEn: optionalText(400),
  bodyAr: body,
  bodyEn: body,
  authorName: optionalText(120),
  metaTitleAr: optionalText(70),
  metaTitleEn: optionalText(70),
  metaDescriptionAr: optionalText(180),
  metaDescriptionEn: optionalText(180),
  isPublished: z.coerce.boolean().default(false),
  publishedAt,
});

export type BlogPostFormInput = z.infer<typeof blogPostFormSchema>;
