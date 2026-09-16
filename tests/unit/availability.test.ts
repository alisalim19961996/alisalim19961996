import { describe, expect, it } from 'vitest';
import { StockStatus } from '@prisma/client';
import {
  availableUnits,
  cheapestPurchasable,
  getAvailability,
  isLowStock,
  isPurchasable,
  pricesDiffer,
  purchasableVariants,
  type InventorySnapshot,
} from '@/lib/domain/availability';

/** MPS's real setup today: availability is a status, units are not counted. */
const uncounted = (status: StockStatus): InventorySnapshot => ({
  trackQuantity: false,
  status,
  onHand: 0,
  reserved: 0,
});

/** The optional counted mode, for the day the store wants it. */
const counted = (onHand: number, reserved: number): InventorySnapshot => ({
  trackQuantity: true,
  status: StockStatus.IN_STOCK,
  onHand,
  reserved,
});

describe('availability without quantity tracking (how MPS runs today)', () => {
  it('sells any quantity while the status says in stock', () => {
    expect(isPurchasable(uncounted(StockStatus.IN_STOCK), 1)).toBe(true);
    expect(isPurchasable(uncounted(StockStatus.IN_STOCK), 99)).toBe(true);
  });

  it('refuses to sell when marked out of stock', () => {
    expect(isPurchasable(uncounted(StockStatus.OUT_OF_STOCK))).toBe(false);
    expect(getAvailability(uncounted(StockStatus.OUT_OF_STOCK))).toEqual({
      kind: 'out_of_stock',
    });
  });

  it('allows preorder but reports it distinctly', () => {
    expect(isPurchasable(uncounted(StockStatus.PREORDER))).toBe(true);
    expect(getAvailability(uncounted(StockStatus.PREORDER))).toEqual({
      kind: 'preorder',
    });
  });

  it('never sells a discontinued product', () => {
    expect(isPurchasable(uncounted(StockStatus.DISCONTINUED))).toBe(false);
  });

  it('never shows a "few left" hint, because there is nothing to count', () => {
    expect(isLowStock(uncounted(StockStatus.IN_STOCK), 3)).toBe(false);
  });

  it('reports unbounded units so callers do not accidentally cap the cart', () => {
    expect(availableUnits(uncounted(StockStatus.IN_STOCK))).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

describe('availability with quantity tracking (opt-in, no migration needed)', () => {
  it('subtracts units already committed to other orders', () => {
    expect(availableUnits(counted(10, 4))).toBe(6);
  });

  it('refuses a quantity larger than what is uncommitted, and says how many remain', () => {
    expect(getAvailability(counted(10, 8), 5)).toEqual({
      kind: 'insufficient',
      available: 2,
    });
    expect(isPurchasable(counted(10, 8), 5)).toBe(false);
    expect(isPurchasable(counted(10, 8), 2)).toBe(true);
  });

  it('treats fully reserved stock as out of stock', () => {
    expect(getAvailability(counted(5, 5))).toEqual({ kind: 'out_of_stock' });
  });

  it('flags low stock only within the threshold', () => {
    expect(isLowStock(counted(10, 8), 3)).toBe(true);
    expect(isLowStock(counted(10, 2), 3)).toBe(false);
    expect(isLowStock(counted(5, 5), 3)).toBe(false);
  });

  it('lets an explicit OUT_OF_STOCK status override a positive count', () => {
    const overridden: InventorySnapshot = {
      trackQuantity: true,
      status: StockStatus.OUT_OF_STOCK,
      onHand: 50,
      reserved: 0,
    };
    expect(isPurchasable(overridden)).toBe(false);
  });
});

/**
 * Which variant a page speaks for.
 *
 * Three surfaces answered this differently: the card took the first buyable
 * variant (correct only because the catalogue query sorts by price), the
 * product page called `variants[0]` "cheapest" though its query sorts by
 * `sortOrder`, and the picker took the first purchasable one in whatever order
 * it was handed. The interesting cases below are all about ORDER, because
 * that is the assumption each of them was making without saying so.
 */
describe('choosing the variant a page speaks for', () => {
  const stocked = (priceIqd: number, status: StockStatus = StockStatus.IN_STOCK) => ({
    priceIqd,
    inventory: { status, trackQuantity: false, onHand: 0, reserved: 0 },
  });

  it('takes the cheapest buyable one even when it is last', () => {
    const variants = [stocked(400_000), stocked(300_000), stocked(250_000)];
    expect(cheapestPurchasable(variants)?.priceIqd).toBe(250_000);
  });

  it('skips a cheaper variant nobody can buy', () => {
    // The bait case: a 128GB that is out of stock must not set the price under
    // a 256GB that is actually on the shelf.
    const variants = [stocked(250_000, StockStatus.OUT_OF_STOCK), stocked(400_000)];
    expect(cheapestPurchasable(variants)?.priceIqd).toBe(400_000);
  });

  it('counts a preorder as buyable and a discontinued one as not', () => {
    expect(
      cheapestPurchasable([stocked(300_000, StockStatus.PREORDER)]),
    ).not.toBeNull();
    expect(
      cheapestPurchasable([stocked(300_000, StockStatus.DISCONTINUED)]),
    ).toBeNull();
  });

  it('returns null when nothing can be bought, rather than the first row', () => {
    const variants = [
      stocked(250_000, StockStatus.OUT_OF_STOCK),
      stocked(400_000, StockStatus.DISCONTINUED),
    ];
    expect(cheapestPurchasable(variants)).toBeNull();
    expect(purchasableVariants(variants)).toEqual([]);
  });

  it('treats a variant with no inventory row as unbuyable', () => {
    expect(cheapestPurchasable([{ priceIqd: 1_000, inventory: null }])).toBeNull();
  });

  it('says prices differ only when they actually do', () => {
    expect(pricesDiffer([stocked(300_000), stocked(400_000)])).toBe(true);
    // Two colours at one price is one price. "From" about it reads as hedging.
    expect(pricesDiffer([stocked(300_000), stocked(300_000)])).toBe(false);
    expect(pricesDiffer([stocked(300_000)])).toBe(false);
    expect(pricesDiffer([])).toBe(false);
  });
});
