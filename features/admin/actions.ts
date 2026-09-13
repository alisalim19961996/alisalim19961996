'use server';

import { revalidatePath } from 'next/cache';
import { advanceOrder, OrderAdminError } from '@/server/services/admin-orders';
import {
  updateDeliveryRate,
  updateSiteSettings,
} from '@/server/services/admin-settings';
import {
  createProduct,
  deleteProduct,
  ProductAdminError,
  setProductPublished,
  updateProduct,
} from '@/server/services/admin-products';
import {
  advanceOrderSchema,
  deliveryRateSchema,
  siteSettingsSchema,
} from '@/schemas/admin';
import { productFormSchema } from '@/schemas/product';
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
  /**
   * The field the error belongs to, where one applies — an attribute key, a
   * SKU. An error with nowhere to point sends the owner hunting through a form
   * with forty inputs.
   */
  field?: string;
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
  if (error instanceof ProductAdminError) {
    return { ok: false, errorKey: error.code, field: error.field };
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

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export interface SaveProductActionResult extends AdminActionResult {
  /** Present on success, so the form can navigate to the product it created. */
  productId?: string;
  /**
   * Variants the owner removed that had already been sold. They are
   * deactivated rather than deleted, and the form says so instead of letting
   * the owner believe they are gone.
   */
  deactivatedVariantCount?: number;
}

/**
 * Create or update a product.
 *
 * One action for both, because the form is the same form and the validation is
 * the same validation — splitting them would mean two places to forget a rule.
 * `id` is the only thing that decides which it is, and it comes from the route,
 * not from the payload the browser could rewrite.
 */
export async function saveProductAction(
  id: string | null,
  input: unknown,
): Promise<SaveProductActionResult> {
  const parsed = productFormSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      errorKey: issue?.message ?? 'invalidRequest',
      field: issue?.path.join('.'),
    };
  }

  let result;
  try {
    result = id
      ? await updateProduct(id, parsed.data)
      : await createProduct(parsed.data);
  } catch (error) {
    return toResult(error);
  }

  revalidatePath('/admin/products', 'page');
  // The storefront caches hard: the catalogue, the homepage rails and the
  // product page itself are all pre-rendered, so an edit that is not
  // revalidated is an edit the customer never sees.
  revalidatePath('/[locale]/products', 'page');
  revalidatePath(`/[locale]/products/${result.slug}`, 'page');
  revalidatePath('/[locale]', 'page');

  return {
    ok: true,
    productId: result.id,
    deactivatedVariantCount: result.deactivatedVariantCount,
  };
}

export async function setProductPublishedAction(input: {
  id: string;
  isPublished: boolean;
}): Promise<AdminActionResult> {
  try {
    await setProductPublished(input.id, input.isPublished);
  } catch (error) {
    return toResult(error);
  }

  revalidatePath('/admin/products', 'page');
  revalidatePath('/[locale]/products', 'page');
  revalidatePath('/[locale]', 'page');
  return { ok: true };
}

export async function deleteProductAction(id: string): Promise<AdminActionResult> {
  try {
    await deleteProduct(id);
  } catch (error) {
    return toResult(error);
  }

  revalidatePath('/admin/products', 'page');
  revalidatePath('/[locale]/products', 'page');
  revalidatePath('/[locale]', 'page');
  return { ok: true };
}
