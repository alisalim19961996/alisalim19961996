'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trackOrderAction, type TrackOrderState } from '../actions';

/**
 * The tracking form.
 *
 * Two fields, both of which the customer already has: the number printed on
 * their confirmation and the phone they ordered with. No account, because most
 * MPS orders are placed as a guest and being asked to register to see your own
 * delivery is hostile.
 *
 * A match redirects to the order page, so this component never renders an
 * order itself — there is one screen for that, and it is a server component.
 */
export function TrackForm() {
  const t = useTranslations('order');
  const tCheckout = useTranslations('checkout');
  const [state, formAction, pending] = useActionState<TrackOrderState, FormData>(
    trackOrderAction,
    { status: 'idle' },
  );

  return (
    <div className="mx-auto max-w-md">
      <p className="text-sm text-muted">{t('trackHint')}</p>

      <form action={formAction} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="orderNumber" className="text-sm font-medium text-ink">
            {t('orderNumber')}
          </label>
          <Input
            id="orderNumber"
            name="orderNumber"
            required
            placeholder="MPS-26091-0042"
            autoComplete="off"
            // Order numbers and phones are Latin-digit and read left-to-right
            // even inside Arabic copy.
            className="numeric"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-ink">
            {tCheckout('phone')}
          </label>
          <Input
            id="phone"
            name="phone"
            required
            type="tel"
            inputMode="tel"
            placeholder={tCheckout('phonePlaceholder')}
            autoComplete="tel"
            className="numeric"
          />
        </div>

        <Button type="submit" size="lg" block disabled={pending}>
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Search aria-hidden />
          )}
          {t('trackSubmit')}
        </Button>

        {state.status === 'error' && (
          <p role="alert" className="text-center text-sm text-danger">
            {t(state.errorKey ?? 'notFound')}
          </p>
        )}
      </form>
    </div>
  );
}
