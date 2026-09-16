'use server';

import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { identifyOrderByNumberAndPhone } from '@/server/queries/order';
import {
  issueOrderGrant,
  ORDER_GRANT_COOKIE,
  ORDER_GRANT_MAX_AGE,
} from '@/server/services/order';
import { trackOrderSchema } from '@/schemas/checkout';
import type { Locale } from '@/i18n/routing';
import { appCookieOptions } from '@/server/cookies';
import { takeTrackOrderAttempt } from '@/server/rate-limit';

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

  /*
    Rate limited on the phone, before the lookup.

    A Server Action is a door better-auth's limiter never sees (§7), and this
    is the one public form that answers with a name and a home address. Order
    numbers are sequential — they have to be readable aloud to a courier — so
    without this, knowing somebody's phone number and walking four digits reads
    back their order. Keyed by the phone because that is the value the attack
    cannot vary; see server/rate-limit.ts.
  */
  if (!takeTrackOrderAttempt(parsed.data.phone).allowed) {
    return { status: 'error', errorKey: 'tooManyAttempts' };
  }

  const locale = (await getLocale()) as Locale;
  const order = await identifyOrderByNumberAndPhone(
    parsed.data.orderNumber,
    parsed.data.phone,
  );

  // A wrong phone and a non-existent order return the same message on purpose.
  // Distinguishing them would turn this form into a way to discover which
  // order numbers are real.
  if (!order) return { status: 'error', errorKey: 'notFound' };

  // Having proved the order is theirs, this browser gets the same grant
  // checkout hands out, and the order page authorises it the same way. The
  // number alone never authorises anything any more.
  const grant = await issueOrderGrant(order.id);

  const store = await cookies();
  store.set(ORDER_GRANT_COOKIE, grant, appCookieOptions(ORDER_GRANT_MAX_AGE));

  return redirect({ href: `/orders/${order.orderNumber}`, locale });
}
