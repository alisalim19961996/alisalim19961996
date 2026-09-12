'use client';

import { useActionState, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Truck, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ProductPrice } from '@/features/product/components/product-price';
import type { Locale } from '@/i18n/routing';
import {
  placeOrderAction,
  quoteDeliveryAction,
  type CheckoutState,
  type DeliveryQuoteResult,
} from '../actions';

/**
 * Checkout, in six fields.
 *
 * Every extra field costs orders, so this asks for exactly what a cash-on-
 * delivery courier needs to reach a door in Iraq and nothing else. There is no
 * account step: signing up mid-purchase is the single most reliable way to
 * lose the sale.
 *
 * The delivery fee is quoted by the server the moment a governorate is picked,
 * using the same function that will price the order, so the number on screen
 * is the number charged.
 */
export function CheckoutForm({
  governorates,
  subtotalIqd,
}: {
  governorates: readonly string[];
  subtotalIqd: number;
}) {
  const t = useTranslations('checkout');
  const tValidation = useTranslations('validation');
  const tGovernorate = useTranslations('governorate');
  const tCart = useTranslations('cart');
  const locale = useLocale() as Locale;

  const [state, formAction, isSubmitting] = useActionState<CheckoutState, FormData>(
    placeOrderAction,
    { status: 'idle' },
  );

  const [governorate, setGovernorate] = useState('');
  const [quote, setQuote] = useState<DeliveryQuoteResult | null>(null);
  const [quoting, startQuoting] = useTransition();

  /**
   * Quoted from the change event rather than an effect: picking a governorate
   * IS the event, so an effect would only re-derive it a render later. The
   * figure comes from the server — the same function that prices the order —
   * so what is displayed and what is charged cannot drift apart.
   */
  const chooseGovernorate = (value: string) => {
    setGovernorate(value);
    if (!value) {
      setQuote(null);
      return;
    }
    startQuoting(async () => {
      setQuote(await quoteDeliveryAction(value));
    });
  };

  const fieldError = (name: string) => state.fieldErrors?.[name];
  const total = subtotalIqd + (quote?.feeIqd ?? 0);

  return (
    <form
      action={formAction}
      className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start"
    >
      {/* The locale travels with the form so the action can redirect into it. */}
      <input type="hidden" name="locale" value={locale} />

      <div className="space-y-8">
        <Section title={t('contactSection')}>
          <Field
            name="fullName"
            label={t('fullName')}
            placeholder={t('fullNamePlaceholder')}
            error={fieldError('fullName')}
            translateError={tValidation}
            required
            autoComplete="name"
          />
          <Field
            name="phone"
            label={t('phone')}
            placeholder={t('phonePlaceholder')}
            hint={t('phoneHint')}
            error={fieldError('phone')}
            translateError={tValidation}
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            // Latin digits and LTR: an Iraqi phone number reads left-to-right
            // even inside Arabic copy.
            className="numeric"
          />
        </Section>

        <Section title={t('addressSection')}>
          <div className="space-y-1.5">
            <label htmlFor="governorate" className="text-sm font-medium text-ink">
              {t('governorate')} <span className="text-danger">*</span>
            </label>
            <select
              id="governorate"
              name="governorate"
              required
              value={governorate}
              onChange={(event) => chooseGovernorate(event.target.value)}
              aria-invalid={Boolean(fieldError('governorate'))}
              className={cn(
                'h-11 w-full rounded-[--radius-control] border border-border bg-surface px-3',
                'text-sm text-ink transition-colors hover:border-border-strong',
                'focus-visible:border-primary aria-invalid:border-danger',
              )}
            >
              <option value="" disabled>
                {t('selectGovernorate')}
              </option>
              {governorates.map((value) => (
                <option key={value} value={value}>
                  {tGovernorate(value)}
                </option>
              ))}
            </select>
            {fieldError('governorate') && (
              <p role="alert" className="text-xs text-danger">
                {tValidation('required')}
              </p>
            )}
          </div>

          <Field
            name="city"
            label={t('city')}
            placeholder={t('cityPlaceholder')}
            error={fieldError('city')}
            translateError={tValidation}
            required
            autoComplete="address-level2"
          />

          <div className="space-y-1.5">
            <label htmlFor="addressLine" className="text-sm font-medium text-ink">
              {t('addressLine')} <span className="text-danger">*</span>
            </label>
            <textarea
              id="addressLine"
              name="addressLine"
              required
              rows={3}
              placeholder={t('addressLinePlaceholder')}
              autoComplete="street-address"
              aria-invalid={Boolean(fieldError('addressLine'))}
              className={cn(
                'w-full rounded-[--radius-control] border border-border bg-surface px-3 py-2.5',
                'text-sm text-ink transition-colors placeholder:text-subtle',
                'hover:border-border-strong focus-visible:border-primary',
                'aria-invalid:border-danger',
              )}
            />
            {fieldError('addressLine') && (
              <p role="alert" className="text-xs text-danger">
                {tValidation(fieldError('addressLine') ?? 'required')}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="notes" className="text-sm font-medium text-ink">
              {t('notes')}{' '}
              <span className="font-normal text-subtle">({t('notesOptional')})</span>
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              placeholder={t('notesPlaceholder')}
              className="w-full rounded-[--radius-control] border border-border bg-surface px-3 py-2.5 text-sm text-ink transition-colors placeholder:text-subtle hover:border-border-strong focus-visible:border-primary"
            />
          </div>
        </Section>

        <Section title={t('paymentMethod')}>
          <div className="flex items-start gap-3 rounded-[--radius-card] border border-border bg-canvas p-4">
            <Wallet className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-ink">{t('cashOnDelivery')}</p>
              <p className="mt-1 text-xs text-muted">{t('cashOnDeliveryNote')}</p>
            </div>
          </div>
        </Section>
      </div>

      <aside className="rounded-[--radius-panel] border border-border bg-surface p-5 lg:sticky lg:top-24">
        <h2 className="text-sm font-semibold text-ink">{tCart('summary')}</h2>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted">{tCart('subtotal')}</dt>
            <dd>
              <ProductPrice priceIqd={subtotalIqd} comparePriceIqd={null} size="sm" />
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted">{tCart('delivery')}</dt>
            <dd className="text-sm">
              {quoting ? (
                <Loader2 className="size-4 animate-spin text-subtle" aria-hidden />
              ) : quote ? (
                quote.isFree ? (
                  <span className="font-medium text-success">{tCart('free')}</span>
                ) : (
                  <ProductPrice
                    priceIqd={quote.feeIqd}
                    comparePriceIqd={null}
                    size="sm"
                  />
                )
              ) : (
                <span className="text-muted">{t('selectGovernorate')}</span>
              )}
            </dd>
          </div>
        </dl>

        {quote && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Truck className="size-4 shrink-0 flip-rtl" aria-hidden />
            <span className="numeric">
              {t('deliveryEta', { min: quote.etaMinDays, max: quote.etaMaxDays })}
            </span>
          </p>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="text-sm font-semibold text-ink">{tCart('total')}</span>
          <ProductPrice priceIqd={total} comparePriceIqd={null} size="md" />
        </div>

        <Button type="submit" size="lg" block className="mt-5" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
          {isSubmitting ? t('submitting') : t('submit')}
        </Button>

        {state.errorKey && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {t(state.errorKey)}
          </p>
        )}
      </aside>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  name,
  label,
  hint,
  error,
  translateError,
  className,
  ...props
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  translateError: (key: string) => string;
} & React.ComponentProps<'input'>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium text-ink">
        {label} {props.required && <span className="text-danger">*</span>}
      </label>
      <Input
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        className={className}
        {...props}
      />
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {translateError(error)}
        </p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}
