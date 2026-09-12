import { MoneyError, sumIqd } from '@/lib/money';

/**
 * Cart and order arithmetic.
 *
 * Pure on purpose: every number a customer is shown, and every number written
 * to an order, is produced here — never in a component, never in a Server
 * Action reading a client payload. The client sends a variant id and a
 * quantity; everything with a currency attached is computed from the database
 * row, on the server, by these functions.
 *
 * Lives in lib/domain/ rather than server/ because it must be unit-testable
 * without a database. Money is a whole number of Iraqi dinars throughout.
 */

/** Maximum units of one variant in a single line. A typo guard, not a policy. */
export const MAX_LINE_QUANTITY = 20;

export interface PricedLine {
  unitPriceIqd: number;
  quantity: number;
}

export interface CartTotals {
  subtotalIqd: number;
  itemCount: number;
  lineCount: number;
}

export interface DeliveryQuote {
  feeIqd: number;
  /** True when the fee was waived by the free-delivery threshold. */
  isFree: boolean;
  etaMinDays: number;
  etaMaxDays: number;
}

export interface OrderTotals {
  subtotalIqd: number;
  discountIqd: number;
  deliveryIqd: number;
  totalIqd: number;
}

/**
 * Clamp a requested quantity into what a line may actually hold.
 *
 * Quantity arrives from a form, so it arrives from anyone. Clamping rather
 * than throwing keeps a fat-fingered "111" from being an error page, but 0 and
 * negatives are rejected outright: "remove" is its own action, and silently
 * turning -3 into 1 would add an item the customer did not ask for.
 */
export function clampQuantity(quantity: number, max = MAX_LINE_QUANTITY): number {
  if (!Number.isInteger(quantity)) {
    throw new MoneyError(`quantity must be a whole number, got ${quantity}`);
  }
  if (quantity < 1) {
    throw new MoneyError(`quantity must be at least 1, got ${quantity}`);
  }
  return Math.min(quantity, max);
}

/**
 * One line's total.
 *
 * The database enforces `lineTotalIqd = unitPriceIqd * quantity` as a CHECK
 * constraint, so a drift between this function and what is stored is not a
 * subtle billing bug — it is a failed transaction.
 */
export function lineTotal(line: PricedLine): number {
  if (!Number.isInteger(line.unitPriceIqd) || line.unitPriceIqd < 0) {
    throw new MoneyError(`unit price must be a non-negative integer`);
  }
  if (!Number.isInteger(line.quantity) || line.quantity < 1) {
    throw new MoneyError(`quantity must be a positive integer`);
  }
  return line.unitPriceIqd * line.quantity;
}

/** Cart subtotal plus the two counts the header and the cart page both need. */
export function cartTotals(lines: readonly PricedLine[]): CartTotals {
  return {
    subtotalIqd: sumIqd(lines.map(lineTotal)),
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    lineCount: lines.length,
  };
}

export interface DeliveryRateSnapshot {
  feeIqd: number;
  etaMinDays: number;
  etaMaxDays: number;
}

export interface DeliverySettings {
  /** Used when a governorate has no explicit rate row. */
  defaultDeliveryIqd: number;
  /** Order subtotal at or above which delivery is free. Null disables it. */
  freeDeliveryOverIqd: number | null;
}

/**
 * What delivery costs for this subtotal, to this governorate.
 *
 * Both inputs come from the database — `DeliveryRate` per governorate and
 * `SiteSetting` for the fallback — because the owner changes delivery prices
 * far more often than anyone deploys. A governorate with no row is not an
 * error: it falls back to the default fee, so adding a governorate rate later
 * is data entry rather than a code change.
 */
export function quoteDelivery(
  subtotalIqd: number,
  rate: DeliveryRateSnapshot | null,
  settings: DeliverySettings,
): DeliveryQuote {
  const baseFee = rate?.feeIqd ?? settings.defaultDeliveryIqd;

  if (!Number.isInteger(baseFee) || baseFee < 0) {
    throw new MoneyError(`delivery fee must be a non-negative integer, got ${baseFee}`);
  }

  const threshold = settings.freeDeliveryOverIqd;
  const isFree = threshold != null && threshold > 0 && subtotalIqd >= threshold;

  return {
    feeIqd: isFree ? 0 : baseFee,
    isFree,
    etaMinDays: rate?.etaMinDays ?? 1,
    etaMaxDays: rate?.etaMaxDays ?? 3,
  };
}

/**
 * The order's money, in the exact shape the `order` table's CHECK constraint
 * requires: `totalIqd = subtotalIqd - discountIqd + deliveryIqd`.
 *
 * A discount larger than the subtotal is refused rather than clamped. Clamping
 * would quietly let a 100% coupon on a 500,000 IQD cart still charge delivery
 * against a negative subtotal; refusing surfaces the bad coupon instead.
 */
export function orderTotals(input: {
  subtotalIqd: number;
  discountIqd?: number;
  deliveryIqd: number;
}): OrderTotals {
  const { subtotalIqd, deliveryIqd } = input;
  const discountIqd = input.discountIqd ?? 0;

  for (const [label, value] of [
    ['subtotal', subtotalIqd],
    ['discount', discountIqd],
    ['delivery', deliveryIqd],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new MoneyError(`${label} must be a non-negative integer, got ${value}`);
    }
  }

  if (discountIqd > subtotalIqd) {
    throw new MoneyError(
      `discount (${discountIqd}) cannot exceed subtotal (${subtotalIqd})`,
    );
  }

  return {
    subtotalIqd,
    discountIqd,
    deliveryIqd,
    totalIqd: subtotalIqd - discountIqd + deliveryIqd,
  };
}
