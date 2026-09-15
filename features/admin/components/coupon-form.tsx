'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox, Field, FormSection, Select } from './form-fields';
import { AdminRecordForm } from './record-form';
import { deleteCouponAction, saveCouponAction } from '../actions';
import type { CouponFormValues } from '@/server/queries/admin-coupons';

/**
 * Create or edit a discount code.
 *
 * `usageCount` is shown and never editable — it belongs to the order
 * transaction, which increments it atomically so two checkouts cannot both
 * take the last use. A form that could set it would be a second writer racing
 * the first.
 */

/** The two shapes a discount comes in, named once for the `<select>`. */
const DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED'] as const;

interface State {
  code: string;
  discountType: string;
  discountValue: string;
  minOrderIqd: string;
  maxDiscountIqd: string;
  usageLimit: string;
  perUserLimit: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

/** `2026-09-15T14:30` — what `<input type="datetime-local">` reads and writes. */
function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function emptyState(): State {
  const now = new Date();
  const inAMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    code: '',
    discountType: 'PERCENTAGE',
    discountValue: '10',
    minOrderIqd: '0',
    maxDiscountIqd: '',
    usageLimit: '',
    perUserLimit: '1',
    // A window that already makes sense, because a code saved with today's
    // date in both boxes is a code that expires the moment it is created.
    startsAt: toLocalInputValue(now),
    endsAt: toLocalInputValue(inAMonth),
    isActive: true,
  };
}

export function CouponForm({ coupon }: { coupon?: CouponFormValues }) {
  const t = useTranslations('admin');
  const [state, setState] = useState<State>(
    coupon
      ? {
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: String(coupon.discountValue),
          minOrderIqd: String(coupon.minOrderIqd),
          maxDiscountIqd:
            coupon.maxDiscountIqd == null ? '' : String(coupon.maxDiscountIqd),
          usageLimit: coupon.usageLimit == null ? '' : String(coupon.usageLimit),
          perUserLimit: String(coupon.perUserLimit),
          startsAt: toLocalInputValue(coupon.startsAt),
          endsAt: toLocalInputValue(coupon.endsAt),
          isActive: coupon.isActive,
        }
      : emptyState(),
  );

  const set = <K extends keyof State>(key: K, value: State[K]) =>
    setState((previous) => ({ ...previous, [key]: value }));

  const isPercentage = state.discountType === 'PERCENTAGE';

  return (
    <AdminRecordForm
      title={coupon ? t('editCoupon') : t('newCoupon')}
      id={coupon?.id}
      name={state.code}
      listHref="/admin/coupons"
      save={() => saveCouponAction(state, coupon?.id)}
      remove={() => deleteCouponAction(coupon?.id ?? '')}
      deleteBlockedReason={
        coupon && coupon.usageCount > 0
          ? t('couponUsed', { count: coupon.usageCount })
          : undefined
      }
    >
      <FormSection title={t('identity')} hint={t('couponCodeHint')}>
        <Field
          label={t('couponCode')}
          name="code"
          value={state.code}
          onChange={(event) => set('code', event.target.value.toUpperCase())}
          dir="ltr"
          required
        />
        <Select
          label={t('couponDiscountType')}
          name="discountType"
          value={state.discountType}
          onChange={(event) => set('discountType', event.target.value)}
        >
          {DISCOUNT_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`couponType_${value}`)}
            </option>
          ))}
        </Select>
        <Field
          label={isPercentage ? t('couponPercent') : t('couponAmount')}
          name="discountValue"
          type="number"
          min={1}
          max={isPercentage ? 100 : undefined}
          value={state.discountValue}
          onChange={(event) => set('discountValue', event.target.value)}
          required
        />
        <Field
          label={t('couponMaxDiscount')}
          name="maxDiscountIqd"
          type="number"
          min={0}
          hint={t('couponMaxDiscountHint')}
          value={state.maxDiscountIqd}
          onChange={(event) => set('maxDiscountIqd', event.target.value)}
        />
      </FormSection>

      <FormSection title={t('couponLimits')} hint={t('couponLimitsHint')}>
        <Field
          label={t('couponMinOrder')}
          name="minOrderIqd"
          type="number"
          min={0}
          value={state.minOrderIqd}
          onChange={(event) => set('minOrderIqd', event.target.value)}
        />
        <Field
          label={t('couponUsageLimit')}
          name="usageLimit"
          type="number"
          min={1}
          hint={t('couponUsageLimitHint')}
          value={state.usageLimit}
          onChange={(event) => set('usageLimit', event.target.value)}
        />
        <Field
          label={t('couponPerUserLimit')}
          name="perUserLimit"
          type="number"
          min={1}
          hint={t('couponPerUserLimitHint')}
          value={state.perUserLimit}
          onChange={(event) => set('perUserLimit', event.target.value)}
        />
        {coupon && (
          <Field
            label={t('couponUsageCount')}
            name="usageCount"
            value={String(coupon.usageCount)}
            hint={t('couponUsageCountHint')}
            readOnly
            disabled
          />
        )}
      </FormSection>

      <FormSection title={t('couponWindow')} hint={t('couponWindowHint')}>
        <Field
          label={t('couponStartsAt')}
          name="startsAt"
          type="datetime-local"
          value={state.startsAt}
          onChange={(event) => set('startsAt', event.target.value)}
          required
        />
        <Field
          label={t('couponEndsAt')}
          name="endsAt"
          type="datetime-local"
          value={state.endsAt}
          onChange={(event) => set('endsAt', event.target.value)}
          required
        />
        <Checkbox
          label={t('couponActive')}
          name="isActive"
          checked={state.isActive}
          onChange={(event) => set('isActive', event.target.checked)}
        />
      </FormSection>
    </AdminRecordForm>
  );
}
