'use server';

import { revalidatePath } from 'next/cache';
import { advanceOrder, OrderAdminError } from '@/server/services/admin-orders';
import {
  updateDeliveryRate,
  updateSiteSettings,
} from '@/server/services/admin-settings';
import {
  advanceOrderSchema,
  deliveryRateSchema,
  siteSettingsSchema,
} from '@/schemas/admin';
import { InvalidOrderTransitionError } from '@/lib/domain/order-state';
import { ForbiddenError, UnauthenticatedError } from '@/server/auth/guards';

/**
 * Admin Server Actions.
 *
 * Thin on purpose: parse, delegate, revalidate. Every rule — who may do this,
 * whether the transition is legal, what happens to the stock — lives in the
 * service, because a Server Action is a public endpoint and the service is
 * what a future admin API or a CLI would call too.
 */

export interface AdminActionResult {
  ok: boolean;
  /** Key under the `admin` namespace in messages/, never a ready-made sentence. */
  errorKey?: string;
}

/**
 * Turn a thrown error into a translatable key.
 *
 * Authorisation failures return the same generic key as anything else: telling
 * an unauthorised caller "you lack the STAFF role" confirms the endpoint
 * exists and names what to phish for.
 */
function toResult(error: unknown): AdminActionResult {
  if (error instanceof InvalidOrderTransitionError) {
    return { ok: false, errorKey: 'illegalTransition' };
  }
  if (error instanceof OrderAdminError) {
    return { ok: false, errorKey: error.code };
  }
  if (error instanceof UnauthenticatedError || error instanceof ForbiddenError) {
    return { ok: false, errorKey: 'notAllowed' };
  }
  console.error('[admin] action failed', error);
  return { ok: false, errorKey: 'actionFailed' };
}

export async function advanceOrderAction(input: {
  orderNumber: string;
  toStatus: string;
  note?: string;
}): Promise<AdminActionResult> {
  const parsed = advanceOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errorKey: 'invalidRequest' };

  try {
    await advanceOrder(parsed.data);
  } catch (error) {
    return toResult(error);
  }

  revalidatePath('/admin/orders', 'page');
  revalidatePath(`/admin/orders/${parsed.data.orderNumber}`, 'page');
  revalidatePath('/admin', 'page');
  return { ok: true };
}

export async function updateDeliveryRateAction(input: {
  governorate: string;
  feeIqd: string | number;
  etaMinDays: string | number;
  etaMaxDays: string | number;
  isActive: boolean;
}): Promise<AdminActionResult> {
  const parsed = deliveryRateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: parsed.error.issues[0]?.message ?? 'invalidRequest' };
  }

  try {
    await updateDeliveryRate(parsed.data);
  } catch (error) {
    return toResult(error);
  }

  revalidatePath('/admin/delivery', 'page');
  // Checkout quotes the fee live, so a stale cached page would show the old
  // price to the next customer.
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function updateSiteSettingsAction(
  _previous: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const parsed = siteSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errorKey: parsed.error.issues[0]?.message ?? 'invalidRequest' };
  }

  try {
    await updateSiteSettings(parsed.data);
  } catch (error) {
    return toResult(error);
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}
