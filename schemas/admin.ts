import { z } from 'zod';
import { OrderStatus } from '@prisma/client';
import { GOVERNORATE_VALUES } from './checkout';
import { normalizeOrderNumber } from '@/lib/domain/order-number';

/**
 * Admin input.
 *
 * Staff are trusted with the data, not with the payload: a dashboard form is
 * still a public HTTP endpoint, and a stale tab sends yesterday's values. So
 * everything is parsed here, and money is validated as whole IQD the same way
 * it is everywhere else.
 */

/** Whole dinars, non-negative. Rejects a decimal rather than rounding it. */
const wholeIqd = z.coerce
  .number()
  .int('notWholeDinars')
  .min(0, 'negativeAmount')
  // Well above any real Iraqi price, but low enough that a mistyped figure
  // with three extra zeros is caught rather than saved.
  .max(1_000_000_000, 'amountTooLarge');

const orderNumber = z
  .string()
  .trim()
  .min(1, 'required')
  .transform((value, ctx) => {
    const normalized = normalizeOrderNumber(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'invalidOrderNumber' });
      return z.NEVER;
    }
    return normalized;
  });

export const advanceOrderSchema = z.object({
  orderNumber,
  toStatus: z.enum(OrderStatus),
  note: z
    .string()
    .trim()
    .max(500, 'tooLong')
    .optional()
    .transform((value) => (value ? value : null)),
});

export const orderFilterSchema = z.object({
  status: z.enum(OrderStatus).optional().catch(undefined),
  q: z.string().trim().max(120).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export const deliveryRateSchema = z
  .object({
    governorate: z.enum(GOVERNORATE_VALUES as [string, ...string[]]),
    feeIqd: wholeIqd,
    etaMinDays: z.coerce.number().int().min(0).max(60),
    etaMaxDays: z.coerce.number().int().min(0).max(60),
    isActive: z.coerce.boolean().default(true),
  })
  .refine((data) => data.etaMaxDays >= data.etaMinDays, {
    message: 'etaRangeReversed',
    path: ['etaMaxDays'],
  });

export const siteSettingsSchema = z.object({
  storeNameAr: z.string().trim().min(1, 'required').max(120, 'tooLong'),
  storeNameEn: z.string().trim().min(1, 'required').max(120, 'tooLong'),
  contactPhone: z.string().trim().max(32).optional().transform(emptyToNull),
  whatsappNumber: z.string().trim().max(32).optional().transform(emptyToNull),
  contactEmail: z
    .union([z.literal(''), z.email('invalidEmail')])
    .optional()
    .transform(emptyToNull),
  defaultDeliveryIqd: wholeIqd,
  // Empty means "no free-delivery threshold", which is different from zero:
  // zero would make every order qualify.
  freeDeliveryOverIqd: z
    .union([z.literal(''), wholeIqd])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
  warrantyNoteAr: z.string().trim().max(2000).optional().transform(emptyToNull),
  warrantyNoteEn: z.string().trim().max(2000).optional().transform(emptyToNull),
});

function emptyToNull(value: string | undefined): string | null {
  return value ? value : null;
}

export type AdvanceOrderInput = z.infer<typeof advanceOrderSchema>;
export type DeliveryRateInput = z.infer<typeof deliveryRateSchema>;
export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;
