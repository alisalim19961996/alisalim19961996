import { OrderStatus } from '@prisma/client';

/**
 * Order state machine.
 *
 * Illegal transitions are rejected here, in one place, rather than being
 * prevented only by not rendering a button. A DELIVERED order cannot silently
 * go back to PENDING because someone replayed a request or clicked twice.
 */

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.READY_FOR_SHIPMENT, OrderStatus.CANCELLED],
  [OrderStatus.READY_FOR_SHIPMENT]: [
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  // Terminal-ish: a delivered order can only come back as a return.
  [OrderStatus.DELIVERED]: [OrderStatus.RETURNED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.RETURNED]: [],
};

/**
 * The happy path, in the order a customer experiences it.
 *
 * Written out rather than derived from the transition table, because what a
 * customer is shown is a deliberate narrative and not every reachable state:
 * CANCELLED and RETURNED are outcomes, not steps, and are reported separately.
 * A test asserts every entry here is a real, reachable status, so the list
 * cannot drift away from the machine.
 */
export const ORDER_PROGRESS: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.READY_FOR_SHIPMENT,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];

/** An order that ended without a successful delivery. */
export function isFailedOutcome(status: OrderStatus): boolean {
  return status === OrderStatus.CANCELLED || status === OrderStatus.RETURNED;
}

/**
 * How an order's own page should present itself.
 *
 * The confirmation page used to open with a green tick and "your order is
 * placed" for every order it could render — including a CANCELLED one, which
 * then contradicted itself two rows later with a red badge. The page is not
 * only seen the moment it is created: it is the page the customer comes back
 * to, and what it says has to keep matching what happened.
 *
 * Pure and here rather than in the page, because it is a rule about order
 * status and a unit test can hold it to all eight.
 */
export type OrderTone = 'progress' | 'delivered' | 'failed';

export function orderTone(status: OrderStatus): OrderTone {
  if (isFailedOutcome(status)) return 'failed';
  if (status === OrderStatus.DELIVERED) return 'delivered';
  return 'progress';
}

/** How far along ORDER_PROGRESS an order is; -1 for a failed outcome. */
export function progressIndex(status: OrderStatus): number {
  return ORDER_PROGRESS.indexOf(status);
}

/** Statuses from which an order can no longer move anywhere. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CANCELLED,
  OrderStatus.RETURNED,
];

/** Statuses that hold a stock reservation which must be released on cancel. */
export const RESERVING_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.READY_FOR_SHIPMENT,
  OrderStatus.OUT_FOR_DELIVERY,
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Statuses an order may legally move to right now — drives admin UI options. */
export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function holdsReservation(status: OrderStatus): boolean {
  return RESERVING_STATUSES.includes(status);
}

export class InvalidOrderTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`Cannot move an order from ${from} to ${to}`);
    this.name = 'InvalidOrderTransitionError';
  }
}

/** Throwing guard for the service layer. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}
