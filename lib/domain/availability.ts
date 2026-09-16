import { StockStatus } from '@prisma/client';

/**
 * Whether a variant can be bought.
 *
 * MPS does not count units: a variant is either available or it is not, and
 * `status` is the whole answer. Counted stock exists for the day the store
 * wants it — when `trackQuantity` is on, availability additionally requires
 * enough uncommitted units. Both paths live here so the cart, the product page
 * and the checkout can never disagree about what "available" means.
 */

export interface InventorySnapshot {
  trackQuantity: boolean;
  status: StockStatus;
  onHand: number;
  reserved: number;
}

export type Availability =
  | { kind: 'available' }
  | { kind: 'preorder' }
  | { kind: 'out_of_stock' }
  | { kind: 'discontinued' }
  | { kind: 'insufficient'; available: number };

/** Units not already committed to an order. Only meaningful when counting. */
export function availableUnits(inventory: InventorySnapshot): number {
  if (!inventory.trackQuantity) return Number.POSITIVE_INFINITY;
  return Math.max(0, inventory.onHand - inventory.reserved);
}

export function getAvailability(
  inventory: InventorySnapshot,
  quantity = 1,
): Availability {
  if (inventory.status === StockStatus.DISCONTINUED) {
    return { kind: 'discontinued' };
  }
  if (inventory.status === StockStatus.OUT_OF_STOCK) {
    return { kind: 'out_of_stock' };
  }

  if (inventory.trackQuantity) {
    const available = availableUnits(inventory);
    if (available <= 0) return { kind: 'out_of_stock' };
    if (quantity > available) return { kind: 'insufficient', available };
  }

  if (inventory.status === StockStatus.PREORDER) return { kind: 'preorder' };
  return { kind: 'available' };
}

/** Can this quantity be added to a cart or ordered right now? */
export function isPurchasable(inventory: InventorySnapshot, quantity = 1): boolean {
  const availability = getAvailability(inventory, quantity);
  return availability.kind === 'available' || availability.kind === 'preorder';
}

/** Should the storefront show a "only a few left" hint? Never when uncounted. */
export function isLowStock(inventory: InventorySnapshot, threshold: number): boolean {
  if (!inventory.trackQuantity) return false;
  const available = availableUnits(inventory);
  return available > 0 && available <= threshold;
}

// ---------------------------------------------------------------------------

/**
 * Picking the variant a page should speak for.
 *
 * Three surfaces used to answer this differently and nobody noticed, because
 * each one looked right on its own:
 *
 *  - the product card took the cheapest variant it could actually buy — which
 *    happened to be correct only because the catalogue query orders variants by
 *    price;
 *  - the product page called `variants[0]` `cheapest` and handed it to the
 *    mobile buy bar, but that query orders by `sortOrder`, so it was neither
 *    the cheapest nor necessarily purchasable — a shopper whose first variant
 *    was sold out saw a disabled bar under a page that was happily selling;
 *  - the picker started on the first purchasable variant in whatever order it
 *    was given.
 *
 * So the rule lives here once, it takes the ordering out of the answer, and it
 * is pure enough to unit-test. `null` when nothing can be bought — the caller
 * decides whether to fall back to an unbuyable variant (a card still has to
 * print a price under its "out of stock") or to show nothing.
 */
export interface PriceableVariant {
  priceIqd: number;
  inventory: InventorySnapshot | null;
}

export function purchasableVariants<T extends PriceableVariant>(
  variants: readonly T[],
): T[] {
  return variants.filter((variant) =>
    variant.inventory ? isPurchasable(variant.inventory) : false,
  );
}

/**
 * The cheapest variant somebody can actually buy, by price rather than by
 * position. A 128GB model that is out of stock beside a 256GB that is not must
 * never set the price on screen: that is the same bait the `minPriceIqd`
 * recompute refuses (§12).
 */
export function cheapestPurchasable<T extends PriceableVariant>(
  variants: readonly T[],
): T | null {
  return purchasableVariants(variants).reduce<T | null>(
    (best, variant) =>
      best === null || variant.priceIqd < best.priceIqd ? variant : best,
    null,
  );
}

/**
 * Do the variants a shopper can buy differ in price?
 *
 * Decides whether a card says "from". A product whose two colours cost the same
 * is one price, and saying "from" about it reads as a shop hedging.
 */
export function pricesDiffer<T extends PriceableVariant>(
  variants: readonly T[],
): boolean {
  const prices = variants.map((variant) => variant.priceIqd);
  return prices.length > 1 && Math.min(...prices) !== Math.max(...prices);
}
