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
