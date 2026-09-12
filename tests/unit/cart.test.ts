import { describe, expect, it } from 'vitest';
import {
  cartTotals,
  clampQuantity,
  lineTotal,
  MAX_LINE_QUANTITY,
  orderTotals,
  quoteDelivery,
} from '@/lib/domain/cart';
import { MoneyError } from '@/lib/money';

describe('clampQuantity', () => {
  it('passes ordinary quantities through', () => {
    expect(clampQuantity(1)).toBe(1);
    expect(clampQuantity(7)).toBe(7);
  });

  it('caps at the per-line maximum instead of failing', () => {
    // A fat-fingered "111" should become a full line, not an error page.
    expect(clampQuantity(111)).toBe(MAX_LINE_QUANTITY);
  });

  it('rejects zero and negatives rather than clamping them up', () => {
    // Clamping -3 to 1 would add an item the customer never asked for;
    // removing a line is its own action.
    expect(() => clampQuantity(0)).toThrow(MoneyError);
    expect(() => clampQuantity(-3)).toThrow(MoneyError);
  });

  it('rejects fractional quantities', () => {
    expect(() => clampQuantity(1.5)).toThrow(MoneyError);
  });
});

describe('lineTotal', () => {
  it('multiplies exactly, with no floating point anywhere', () => {
    expect(lineTotal({ unitPriceIqd: 1_250_000, quantity: 3 })).toBe(3_750_000);
  });

  it('matches the CHECK constraint the database enforces', () => {
    // order_item_line_total_consistent: lineTotalIqd = unitPriceIqd * quantity
    const unitPriceIqd = 385_000;
    const quantity = 4;
    expect(lineTotal({ unitPriceIqd, quantity })).toBe(unitPriceIqd * quantity);
  });

  it('rejects a zero or negative quantity', () => {
    expect(() => lineTotal({ unitPriceIqd: 1000, quantity: 0 })).toThrow(MoneyError);
    expect(() => lineTotal({ unitPriceIqd: 1000, quantity: -1 })).toThrow(MoneyError);
  });

  it('rejects a negative price', () => {
    expect(() => lineTotal({ unitPriceIqd: -1, quantity: 1 })).toThrow(MoneyError);
  });
});

describe('cartTotals', () => {
  it('sums line totals and counts units and lines separately', () => {
    const totals = cartTotals([
      { unitPriceIqd: 385_000, quantity: 2 },
      { unitPriceIqd: 12_000, quantity: 3 },
    ]);
    expect(totals.subtotalIqd).toBe(806_000);
    // Five units across two lines: the header shows units, the page shows lines.
    expect(totals.itemCount).toBe(5);
    expect(totals.lineCount).toBe(2);
  });

  it('is zero for an empty cart', () => {
    expect(cartTotals([])).toEqual({ subtotalIqd: 0, itemCount: 0, lineCount: 0 });
  });
});

describe('quoteDelivery', () => {
  const settings = { defaultDeliveryIqd: 5_000, freeDeliveryOverIqd: null };

  it('uses the governorate rate when one exists', () => {
    const quote = quoteDelivery(
      100_000,
      { feeIqd: 8_000, etaMinDays: 2, etaMaxDays: 4 },
      settings,
    );
    expect(quote).toEqual({
      feeIqd: 8_000,
      isFree: false,
      etaMinDays: 2,
      etaMaxDays: 4,
    });
  });

  it('falls back to the default fee when a governorate has no rate', () => {
    // A missing rate row is data the owner has not filled in yet, not an error.
    const quote = quoteDelivery(100_000, null, settings);
    expect(quote.feeIqd).toBe(5_000);
    expect(quote.etaMinDays).toBe(1);
    expect(quote.etaMaxDays).toBe(3);
  });

  it('waives the fee at or above the free-delivery threshold', () => {
    const withThreshold = { defaultDeliveryIqd: 5_000, freeDeliveryOverIqd: 250_000 };
    const rate = { feeIqd: 8_000, etaMinDays: 1, etaMaxDays: 2 };

    expect(quoteDelivery(249_999, rate, withThreshold).feeIqd).toBe(8_000);
    // Exactly on the threshold qualifies: "free over 250,000" reads as
    // inclusive to a customer looking at a 250,000 cart.
    expect(quoteDelivery(250_000, rate, withThreshold)).toMatchObject({
      feeIqd: 0,
      isFree: true,
    });
  });

  it('ignores a zero threshold rather than making everything free', () => {
    const zeroed = { defaultDeliveryIqd: 5_000, freeDeliveryOverIqd: 0 };
    expect(quoteDelivery(1_000, null, zeroed).feeIqd).toBe(5_000);
  });

  it('rejects a negative fee', () => {
    expect(() =>
      quoteDelivery(1_000, { feeIqd: -1, etaMinDays: 1, etaMaxDays: 2 }, settings),
    ).toThrow(MoneyError);
  });
});

describe('orderTotals', () => {
  it('matches the CHECK constraint: total = subtotal - discount + delivery', () => {
    expect(
      orderTotals({ subtotalIqd: 800_000, discountIqd: 50_000, deliveryIqd: 8_000 }),
    ).toEqual({
      subtotalIqd: 800_000,
      discountIqd: 50_000,
      deliveryIqd: 8_000,
      totalIqd: 758_000,
    });
  });

  it('defaults the discount to zero', () => {
    expect(orderTotals({ subtotalIqd: 100_000, deliveryIqd: 5_000 }).totalIqd).toBe(
      105_000,
    );
  });

  it('still charges delivery on a fully discounted cart', () => {
    const totals = orderTotals({
      subtotalIqd: 100_000,
      discountIqd: 100_000,
      deliveryIqd: 5_000,
    });
    expect(totals.totalIqd).toBe(5_000);
  });

  it('refuses a discount larger than the subtotal', () => {
    // Clamping would quietly bill delivery against a negative subtotal.
    expect(() =>
      orderTotals({ subtotalIqd: 100_000, discountIqd: 100_001, deliveryIqd: 5_000 }),
    ).toThrow(MoneyError);
  });

  it('refuses negative components', () => {
    expect(() => orderTotals({ subtotalIqd: -1, deliveryIqd: 0 })).toThrow(MoneyError);
    expect(() => orderTotals({ subtotalIqd: 0, deliveryIqd: -1 })).toThrow(MoneyError);
  });
});
