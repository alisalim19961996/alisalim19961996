import { z } from 'zod';
import { normalizeOrderNumber } from '@/lib/domain/order-number';
import { normaliseCouponCode } from '@/lib/domain/coupon';
import { deliveryAddressFields, iraqiPhone } from '@/schemas/address';

/**
 * Checkout input.
 *
 * Six fields, because every extra one costs orders. Cash on delivery needs a
 * name, a reachable phone, and enough address to find the door — nothing else
 * is required to fulfil an Iraqi delivery, so nothing else is asked. The
 * fields themselves live in `schemas/address.ts`, which the account's saved
 * address reads from too, so the two screens cannot drift apart.
 *
 * As with the cart: no money crosses this boundary. The delivery fee, the
 * subtotal and the total are all recomputed server-side from the cart rows and
 * the `DeliveryRate` table.
 */

export { GOVERNORATE_VALUES } from '@/schemas/address';

export const checkoutSchema = z.object({
  ...deliveryAddressFields,
  /*
    The CODE, never an amount — the note above still holds. What the code is
    worth is decided by `lib/domain/coupon.ts` inside the same transaction that
    writes the order, from the coupon row, so a client that sends a discount
    has nowhere to put it.
  */
  couponCode: z
    .string()
    .trim()
    .max(40, 'tooLong')
    .optional()
    .transform((value) => (value ? normaliseCouponCode(value) : null)),
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
