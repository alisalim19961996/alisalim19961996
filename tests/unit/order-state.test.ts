import { describe, expect, it } from 'vitest';
import { OrderStatus } from '@prisma/client';
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  holdsReservation,
  InvalidOrderTransitionError,
  isTerminal,
} from '@/server/services/order-state';

describe('order state machine', () => {
  it('permits the normal fulfilment path', () => {
    const path = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.READY_FOR_SHIPMENT,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ];

    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('refuses to move an order backwards', () => {
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.PENDING)).toBe(false);
    expect(canTransition(OrderStatus.PROCESSING, OrderStatus.CONFIRMED)).toBe(false);
    expect(canTransition(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.PROCESSING)).toBe(false);
  });

  it('refuses to skip stages', () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.DELIVERED)).toBe(false);
    expect(canTransition(OrderStatus.CONFIRMED, OrderStatus.OUT_FOR_DELIVERY)).toBe(false);
  });

  it('allows cancelling at any point before delivery', () => {
    for (const status of [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.READY_FOR_SHIPMENT,
      OrderStatus.OUT_FOR_DELIVERY,
    ]) {
      expect(canTransition(status, OrderStatus.CANCELLED)).toBe(true);
    }
  });

  it('does not allow cancelling a delivered order — that is a return', () => {
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.CANCELLED)).toBe(false);
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.RETURNED)).toBe(true);
  });

  it('treats cancelled and returned as terminal', () => {
    expect(isTerminal(OrderStatus.CANCELLED)).toBe(true);
    expect(isTerminal(OrderStatus.RETURNED)).toBe(true);
    expect(allowedTransitions(OrderStatus.CANCELLED)).toHaveLength(0);
    expect(allowedTransitions(OrderStatus.RETURNED)).toHaveLength(0);
  });

  it('knows which statuses still hold stock reserved', () => {
    expect(holdsReservation(OrderStatus.PENDING)).toBe(true);
    expect(holdsReservation(OrderStatus.OUT_FOR_DELIVERY)).toBe(true);
    // Stock is consumed on delivery and released on cancellation, so neither
    // still holds a reservation.
    expect(holdsReservation(OrderStatus.DELIVERED)).toBe(false);
    expect(holdsReservation(OrderStatus.CANCELLED)).toBe(false);
  });

  it('throws a typed error on an illegal transition', () => {
    expect(() =>
      assertTransition(OrderStatus.DELIVERED, OrderStatus.PENDING),
    ).toThrow(InvalidOrderTransitionError);
    expect(() =>
      assertTransition(OrderStatus.PENDING, OrderStatus.CONFIRMED),
    ).not.toThrow();
  });
});
