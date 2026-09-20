'use server';

import { quoteDeliveryFor } from '@/server/services/order';
import { GOVERNORATE_VALUES } from '@/schemas/checkout';

/**
 * The delivery fee and ETA for one governorate, for the product page.
 *
 * Separate from the checkout action because that one derives the subtotal from
 * the cart — which is the right thing there and the wrong thing here: a shopper
 * looking at a phone has not put it in a cart yet, and quoting against whatever
 * else is in one would answer a question they did not ask.
 *
 * `subtotalIqd` comes from the client, and that is safe because this figure is
 * an ESTIMATE and nothing else: the order recomputes every number inside its
 * own transaction from the variant rows (§12), so a tampered value here changes
 * what a page says and never what anybody is charged.
 */
export async function quoteDeliveryForProductAction(
  governorateInput: string,
  subtotalIqd: number,
): Promise<{
  feeIqd: number;
  isFree: boolean;
  etaMinDays: number;
  etaMaxDays: number;
} | null> {
  const governorate = GOVERNORATE_VALUES.find((value) => value === governorateInput);
  if (!governorate) return null;

  const subtotal = Number.isFinite(subtotalIqd)
    ? Math.max(0, Math.trunc(subtotalIqd))
    : 0;
  return quoteDeliveryFor(governorate, subtotal);
}
