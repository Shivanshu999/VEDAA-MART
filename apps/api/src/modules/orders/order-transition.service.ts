import { OrderStatus, PaymentStatus } from "@vedaa/database";
import { AppError } from "@vedaa/shared";

const STAFF_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED],
  CONFIRMED: [OrderStatus.PREPARING],
  PREPARING: [OrderStatus.READY_FOR_DELIVERY],
  READY_FOR_DELIVERY: [OrderStatus.OUT_FOR_DELIVERY],
  OUT_FOR_DELIVERY: [OrderStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
};

export function getAllowedStaffTransitions(
  status: OrderStatus,
  paymentStatus: PaymentStatus,
): OrderStatus[] {
  if (paymentStatus !== PaymentStatus.CAPTURED) return [];
  return [...STAFF_TRANSITIONS[status]];
}

export function assertStaffOrderTransition(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus,
  paymentStatus: PaymentStatus,
): void {
  if (paymentStatus !== PaymentStatus.CAPTURED) {
    throw new AppError(
      "Order must have a captured payment before staff processing",
      "ORDER_PAYMENT_REQUIRED",
      409,
    );
  }
  if (!STAFF_TRANSITIONS[currentStatus].includes(nextStatus)) {
    throw new AppError(
      `Cannot transition order from ${currentStatus} to ${nextStatus}`,
      "INVALID_ORDER_TRANSITION",
      409,
    );
  }
}