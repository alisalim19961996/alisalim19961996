import { describe, expect, it } from 'vitest';
import { deliveryRateSchema, siteSettingsSchema } from '@/schemas/admin';

/**
 * An empty number box is missing, not zero — on the screens where zero costs
 * money.
 *
 * `z.coerce.number()` runs `Number('')`, which is 0, and 0 dinars of delivery
 * is free delivery. The delivery screen shows a blank fee for every
 * governorate that has no custom rate yet, so pressing save on such a row to
 * change only the days made delivery there free on every order afterwards.
 * Nothing complained: zero is a perfectly valid amount.
 *
 * These are the cases that were silently accepted before `blankIsMissing`
 * reached `schemas/admin.ts`.
 */

const RATE = {
  governorate: 'BAGHDAD',
  feeIqd: '5000',
  etaMinDays: '1',
  etaMaxDays: '3',
  isActive: true,
};

describe('a delivery rate refuses a blank where zero would be a promise', () => {
  it('accepts a filled row', () => {
    const parsed = deliveryRateSchema.safeParse(RATE);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.feeIqd).toBe(5000);
  });

  it('refuses a blank fee instead of making delivery free', () => {
    const parsed = deliveryRateSchema.safeParse({ ...RATE, feeIqd: '' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(['feeIqd']);
  });

  it('refuses a whitespace fee, which is what a half-cleared box leaves', () => {
    expect(deliveryRateSchema.safeParse({ ...RATE, feeIqd: '  ' }).success).toBe(false);
  });

  it('still accepts a deliberate zero, which means free', () => {
    const parsed = deliveryRateSchema.safeParse({ ...RATE, feeIqd: '0' });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.feeIqd).toBe(0);
  });

  it('refuses a blank day range rather than promising nought to nought', () => {
    expect(deliveryRateSchema.safeParse({ ...RATE, etaMinDays: '' }).success).toBe(
      false,
    );
    expect(deliveryRateSchema.safeParse({ ...RATE, etaMaxDays: '' }).success).toBe(
      false,
    );
  });

  it('refuses a reversed range', () => {
    const parsed = deliveryRateSchema.safeParse({
      ...RATE,
      etaMinDays: '5',
      etaMaxDays: '2',
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('etaRangeReversed');
  });
});

describe('the store-wide default delivery fee', () => {
  it('refuses a blank, which would make every governorate free', () => {
    const parsed = siteSettingsSchema.safeParse({ defaultDeliveryIqd: '' });
    expect(parsed.success).toBe(false);
    expect(
      parsed.error?.issues.some((issue) => issue.path[0] === 'defaultDeliveryIqd'),
    ).toBe(true);
  });
});
