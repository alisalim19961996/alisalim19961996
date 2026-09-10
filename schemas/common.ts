import { z } from 'zod';
import { Governorate } from '@prisma/client';
import { normalizeIraqiPhone } from '@/lib/phone';

/**
 * Shared schemas. The same object validates the form in the browser AND the
 * Server Action on the server — the client-side pass is a convenience, the
 * server-side pass is the one that counts.
 */

export const iraqiPhoneSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value, ctx) => {
    const normalized = normalizeIraqiPhone(value);
    if (!normalized) {
      ctx.addIssue({
        code: 'custom',
        message: 'invalidPhone',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const governorateSchema = z.enum(Governorate);

/** Quantity of a single line item. Capped to keep a typo from reserving 9999. */
export const quantitySchema = z
  .number()
  .int('invalidQuantity')
  .min(1, 'invalidQuantity')
  .max(20, 'invalidQuantity');

/** Whole Iraqi dinars. Never a float. */
export const iqdSchema = z
  .number()
  .int()
  .min(0)
  .max(2_000_000_000);

export const cuidSchema = z.string().min(1).max(64);

export const localeSchema = z.enum(['ar', 'en']);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  perPage: z.coerce.number().int().min(1).max(60).default(24),
});

export const addressSchema = z.object({
  fullName: z.string().trim().min(3, 'required').max(120, 'tooLong'),
  phone: iraqiPhoneSchema,
  governorate: governorateSchema,
  city: z.string().trim().min(2, 'required').max(80, 'tooLong'),
  addressLine: z.string().trim().min(5, 'required').max(300, 'tooLong'),
  landmark: z.string().trim().max(160, 'tooLong').optional().or(z.literal('')),
  notes: z.string().trim().max(500, 'tooLong').optional().or(z.literal('')),
});

export type AddressInput = z.infer<typeof addressSchema>;
