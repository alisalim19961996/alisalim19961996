'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from '@/i18n/navigation';
import { findCart } from '@/server/services/cart';
import {
  PlaceOrderError,
  placeOrder,
  quoteCoupon,
  quoteDeliveryFor,
  RECENT_ORDER_COOKIE,
  RECENT_ORDER_MAX_AGE,
} from '@/server/services/order';
import { getCartView } from '@/server/queries/cart';
import { checkoutSchema, GOVERNORATE_VALUES } from '@/schemas/checkout';
import { locales, type Locale } from '@/i18n/routing';
import { appCookieOptions } from '@/server/cookies';
import { normaliseCouponCode, type CouponRefusal } from '@/lib/domain/coupon';

/**
 * Checkout Server Actions.
 *
 * The form carries an address and nothing else. The cart is resolved from the
 * session or the httpOnly cart cookie — never from a field — so a crafted
 * request cannot check out somebody else's cart, and no price or total that
 * arrives here is read at all.
 */

export interface CheckoutState {
  status: 'idle' | 'error';
  /** Field name -> message key under `validation`. */
  fieldErrors?: Record<string, string>;
  /** Message key under `checkout`, for failures that are not field-specific. */
  errorKey?: string;
}

export type CouponQuoteResult =
  | { ok: true; code: string; discountIqd: number }
  | { ok: false; reason: CouponRefusal };

export interface DeliveryQuoteResult {
  feeIqd: number;
  isFree: boolean;
  etaMinDays: number;
  etaMaxDays: number;
}

function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/**
 * Live delivery quote for the governorate the customer just picked.
 *
 * Deliberately the same function the order will be priced with, so the figure
 * on screen and the figure charged cannot diverge.
 */
export async function quoteDeliveryAction(
  governorateInput: string,
): Promise<DeliveryQuoteResult | null> {
  // GOVERNORATE_VALUES comes from schemas/, which owns the enum's public
  // surface. The UI layer does not import Prisma — a rule enforced by both
  // ESLint and tests/architecture.test.ts.
  const governorate = GOVERNORATE_VALUES.find((value) => value === governorateInput);
  if (!governorate) return null;

  // The subtotal is re-derived from the cart rather than accepted as an
  // argument, so this estimate is computed from the same rows the order will
  // be priced from. Locale is irrelevant to the subtotal, hence the default.
  const cart = await findCart();
  if (!cart) return null;

  const { subtotalIqd } = await getCartView(cart.id, 'ar');
  return quoteDeliveryFor(governorate, subtotalIqd);
}

/**
 * What a code is worth against the cart as it stands right now.
 *
 * Quoted from the same rows and the same rules the order will be priced from,
 * exactly as the delivery fee is: the subtotal is re-derived from the cart
 * rather than accepted as an argument, so this cannot be talked into
 * discounting a basket the customer does not have.
 *
 * A refusal comes back as a key, never a sentence, and never says which of
 * "no such code", "switched off" or "out of season" it was.
 */
export async function quoteCouponAction(codeInput: string): Promise<CouponQuoteResult> {
  const code = normaliseCouponCode(String(codeInput ?? ''));
  if (!code) return { ok: false, reason: 'couponInvalid' };

  const cart = await findCart();
  if (!cart) return { ok: false, reason: 'couponInvalid' };

  const { subtotalIqd } = await getCartView(cart.id, 'ar');
  return quoteCoupon(code, subtotalIqd);
}

export async function placeOrderAction(
  _previous: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const rawLocale = String(formData.get('locale') ?? '');
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'ar';

  const parsed = checkoutSchema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    governorate: formData.get('governorate'),
    city: formData.get('city'),
    addressLine: formData.get('addressLine'),
    notes: formData.get('notes') ?? undefined,
    couponCode: formData.get('couponCode') ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return { status: 'error', fieldErrors };
  }

  const cart = await findCart();
  if (!cart) return { status: 'error', errorKey: 'emptyCart' };

  let orderNumber: string;
  try {
    const placed = await placeOrder(cart.id, parsed.data);
    orderNumber = placed.orderNumber;
  } catch (error) {
    if (error instanceof PlaceOrderError) {
      // The reason, not the category: "this code has been used up" and "your
      // order is below the minimum" ask the customer for different things, and
      // one generic message would leave them retyping a code that will never
      // work.
      const errorKey =
        error.failure.code === 'couponRejected'
          ? error.failure.reason
          : error.failure.code;
      return { status: 'error', errorKey };
    }
    console.error('[checkout] placing order failed', error);
    return { status: 'error', errorKey: 'orderFailed' };
  }

  const store = await cookies();
  store.set(RECENT_ORDER_COOKIE, orderNumber, appCookieOptions(RECENT_ORDER_MAX_AGE));

  revalidatePath('/', 'layout');

  // redirect throws, so it must sit outside the try above or it would be
  // caught and reported as a failed order that actually succeeded. It is
  // returned rather than called because next-intl's redirect is destructured
  // from createNavigation, and TypeScript only applies its never-return
  // analysis to bindings that carry an explicit annotation.
  return redirect({ href: `/orders/${orderNumber}`, locale });
}
