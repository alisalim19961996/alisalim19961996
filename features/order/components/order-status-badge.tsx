import { Badge } from '@/components/ui/badge';
import type { OrderStatus } from '@prisma/client';

/**
 * One status, coloured by what it means for the person reading it.
 *
 * It lives in `features/order/` rather than `features/admin/`, where it was
 * written: it describes an order, not an administrator, and the customer's own
 * order history needs exactly the same badge. A second copy would be the one
 * that keeps PENDING neutral after someone changes it here.
 *
 * PENDING is the only one drawn in the brand colour, because it is the only
 * one that means "somebody has to do something now". Everything in flight is
 * neutral, everything finished is green, everything failed is red — so a
 * staff member scanning fifty rows sees the work, not a rainbow.
 */

const TONE: Record<OrderStatus, 'neutral' | 'discount' | 'success' | 'danger'> = {
  PENDING: 'discount',
  CONFIRMED: 'neutral',
  PROCESSING: 'neutral',
  READY_FOR_SHIPMENT: 'neutral',
  OUT_FOR_DELIVERY: 'neutral',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  RETURNED: 'danger',
};

export function OrderStatusBadge({
  status,
  label,
}: {
  status: OrderStatus;
  label: string;
}) {
  return (
    <Badge variant={TONE[status]} className="whitespace-nowrap">
      {label}
    </Badge>
  );
}
