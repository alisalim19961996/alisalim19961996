import { z } from 'zod';
import { Governorate } from '@prisma/client';
import { normalizeIraqiPhone } from '@/lib/phone';

/**
 * A delivery address, in the one place both screens that ask for one read it
 * from.
 *
 * Checkout takes it per order and snapshots it; the account saves it so a
 * returning customer is not retyping their own street every purchase. Those
 * are two different lifetimes for one shape, and writing the shape twice is
 * how "governorate" ends up required in one and optional in the other (§13.16
 * — one source of truth per value).
 *
 * `landmark` exists on the `Address` table and is deliberately not here:
 * checkout does not ask for it, so a form that collected it would be asking
 * the customer for data nothing renders.
 */

export const GOVERNORATE_VALUES = Object.values(Governorate);

/**
 * Stored E.164 (+9647XXXXXXXX), typed however the customer types it: 07XX,
 * +964, 00964, spaced, dashed, or in Arabic-Indic digits. Normalising rather
 * than validating a format means the store accepts what people actually write
 * and keeps one canonical form for tracking to match against.
 */
export const iraqiPhone = z
  .string()
  .trim()
  .min(1)
  .transform((value, ctx) => {
    const normalized = normalizeIraqiPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'invalidPhone' });
      return z.NEVER;
    }
    return normalized;
  });

/**
 * The six fields a cash-on-delivery courier needs to reach a door in Iraq.
 * Spread into a schema rather than nested, so the field errors a form reads
 * stay flat — `fieldErrors.city`, not `fieldErrors['address.city']`.
 */
export const deliveryAddressFields = {
  fullName: z.string().trim().min(2, 'required').max(120, 'tooLong'),
  phone: iraqiPhone,
  governorate: z.enum(Governorate),
  city: z.string().trim().min(2, 'required').max(120, 'tooLong'),
  addressLine: z.string().trim().min(5, 'required').max(400, 'tooLong'),
  // Optional, and normalised to null so the column holds one kind of "empty".
  notes: z
    .string()
    .trim()
    .max(600, 'tooLong')
    .optional()
    .transform((value) => (value ? value : null)),
} as const;

/** The saved address on `/account`. Exactly the delivery fields, nothing else. */
export const savedAddressSchema = z.object(deliveryAddressFields);

export type SavedAddressInput = z.infer<typeof savedAddressSchema>;
