import { z } from 'zod';
import { normalizeIraqiPhone } from '@/lib/phone';

/**
 * What a customer may change about their own account.
 *
 * Two fields, and the omission is the design. `email` is the sign-in identity:
 * changing it through an ordinary profile form would let anybody who borrows an
 * unlocked laptop move the account to an address they control, and would need a
 * confirmation round trip to the OLD address to be safe — which needs mail,
 * which is not configured (§7). So it is displayed and not editable, and the
 * screen says why rather than offering a field that quietly does nothing.
 *
 * The saved delivery address is a separate schema below, and a separate form,
 * because the two are edited at different moments: a name is corrected once,
 * an address is confirmed before a purchase. The address fields themselves
 * come from `schemas/address.ts`, which checkout reads from as well.
 */

/**
 * Stored E.164, typed however the customer types it. Deliberately the same
 * rule checkout uses; this one is optional, because an account can exist
 * without a phone and clearing it must stay possible.
 */
const optionalIraqiPhone = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === '') return null;
    const normalized = normalizeIraqiPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'invalidPhone' });
      return z.NEVER;
    }
    return normalized;
  });

export const profileSchema = z.object({
  name: z.string().trim().min(2, 'required').max(120, 'tooLong'),
  phone: optionalIraqiPhone,
});

export type ProfileInput = z.infer<typeof profileSchema>;

/**
 * The delivery address a signed-in customer keeps.
 *
 * It is a convenience, not a record: checkout still snapshots whatever was
 * typed onto the order, because an order is a historical document and must
 * keep saying where it actually went even after the customer moves house.
 */
export { savedAddressSchema, type SavedAddressInput } from '@/schemas/address';
