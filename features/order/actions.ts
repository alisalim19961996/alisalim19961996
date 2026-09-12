'use server';

import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { findOrderByNumberAndPhone } from '@/server/queries/order';
import { RECENT_ORDER_COOKIE, RECENT_ORDER_MAX_AGE } from '@/server/services/order';
import { trackOrderSchema } from '@/schemas/checkout';
import type { Locale } from '@/i18n/routing';

/**
 * Public order tracking.
 *
 * A Server Action rather than a GET with query parameters, because the phone
 * number is what authorises the lookup: putting it in a URL would write it into
 * browser history, server logs and any Referer header the page emits.
 *
 * On a match it grants this browser the same short-lived cookie checkout
 * issues, then redirects to the order page. That way there is exactly one
 * screen that renders an order, and the customer ends up on a real URL they
 * can return to instead of a result that vanishes on refresh.
 */

export interface TrackOrderState {
  status: 'idle' | 'error';
  /** Key under the `order` namespace. */
  errorKey?: string;
}

export async function trackOrderAction(
  _previous: TrackOrderState,
  formData: FormData,
): Promise<TrackOrderState> {
  const parsed = trackOrderSchema.safeParse({
    orderNumber: formData.get('orderNumber'),
    phone: formData.get('phone'),
  });

  if (!parsed.success) {
    const invalidNumber = parsed.error.issues.some(
      (issue) => issue.message === 'invalidOrderNumber',
    );
    return {
      status: 'error',
      errorKey: invalidNumber ? 'invalidOrderNumber' : 'notFound',
    };
  }

  const locale = (await getLocale()) as Locale;
  const order = await findOrderByNumberAndPhone(
    parsed.data.orderNumber,
    parsed.data.phone,
    locale,
  );

  // A wrong phone and a non-existent order return the same message on purpose.
  // Distinguishing them would turn this form into a way to discover which
  // order numbers are real.
  if (!order) return { status: 'error', errorKey: 'notFound' };

  const store = await cookies();
  store.set(RECENT_ORDER_COOKIE, order.orderNumber, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: RECENT_ORDER_MAX_AGE,
  });

  return redirect({ href: `/orders/${order.orderNumber}`, locale });
}
