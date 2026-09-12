import { z } from 'zod';
import { Governorate } from '@prisma/client';
import { normalizeIraqiPhone } from '@/lib/phone';
import { normalizeOrderNumber } from '@/lib/domain/order-number';

/**
 * Checkout input.
 *
 * Six fields, because every extra one costs orders. Cash on delivery needs a
 * name, a reachable phone, and enough address to find the door — nothing else
 * is required to fulfil an Iraqi delivery, so nothing else is asked.
 *
 * As with the cart: no money crosses this boundary. The delivery fee, the
 * subtotal and the total are all recomputed server-side from the cart rows and
 * the `DeliveryRate` table.
 */

export const GOVERNORATE_VALUES = Object.values(Governorate);

/**
 * Phone is stored E.164 (+9647XXXXXXXX) but typed however the customer types
 * it: 07XX, +964, 00964, spaced, dashed, or in Arabic-Indic digits. Normalising
 * here rather than validating a format means the store accepts what people
 * actually write, and stores one canonical form for tracking to match against.
 */
const iraqiPhone = z
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

export const checkoutSchema = z.object({
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
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/**
 * Public order tracking: the order number plus the phone that placed it.
 *
 * The phone is the authorisation. An order number alone is guessable — they
 * are sequential by design — so tracking requires something only the customer
 * knows, without forcing them to create an account to see their own order.
 */
export const trackOrderSchema = z.object({
  orderNumber: z
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
    }),
  phone: iraqiPhone,
});

export type TrackOrderInput = z.infer<typeof trackOrderSchema>;
