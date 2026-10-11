import { createHash, randomUUID } from "node:crypto";
import Razorpay from "razorpay";
import { OrderStatus, PaymentStatus, Prisma, prisma } from "@vedaa/database";
import { AppError } from "@vedaa/shared";
import type { Env } from "../../env.js";
import {
  finalizeReservedInventoryForOrder,
  getOutstandingOrderReservations,
} from "../inventory/inventory.service.js";
import {
  amountToMinorUnits,
  assertCapturedPaymentMatches,
  verifyCheckoutSignature,
} from "./razorpay-verification.js";

type GatewayOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt?: string | null;
  status?: string;
  notes?: Record<string, string | number>;
};

type GatewayPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
  method?: string;
};

export interface RazorpayGateway {
  orders: {
    create(input: {
      amount: number;
      currency: string;
      receipt: string;
      notes: Record<string, string>;
    }): Promise<GatewayOrder>;
    all(input: { receipt: string; count: number }): Promise<{ items: GatewayOrder[] }>;
  };
  payments: {
    fetch(paymentId: string): Promise<GatewayPayment>;
  };
}

export type CreatePaymentOrderInput = {
  userId: string;
  orderId: string;
  idempotencyKey: string;
};

export type VerifyPaymentInput = {
  userId: string;
  orderId: string;
  attemptId: string;
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
};

export type PaymentAdapter = {
  createPaymentOrder(input: CreatePaymentOrderInput): Promise<{
    attemptId: string;
    providerOrderId: string;
    amount: number;
    currency: string;
    keyId: string;
  }>;
  verifyPayment(input: VerifyPaymentInput): Promise<PaymentVerificationResult>;
  markPaymentFailed(input: Omit<VerifyPaymentInput, "signature">): Promise<{
    failed: boolean;
    replayed: boolean;
  }>;
};

export type PaymentVerificationResult = {
  verified: true;
  replayed: boolean;
  reconciliationRequired: boolean;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
};

type PreparedAttempt = {
  attempt: {
    id: string;
    paymentId: string;
    attemptNumber: number;
    idempotencyKey: string;
    requestHash: string;
    receipt: string;
    providerOrderId: string | null;
    status: PaymentStatus;
    amount: Prisma.Decimal;
    currency: string;
  };
  paymentId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
};

function unavailablePaymentAdapter(): PaymentAdapter {
  const unavailable = async (): Promise<never> => {
    throw new AppError("Razorpay payments are not configured", "PAYMENT_CONFIG", 503);
  };
  return {
    createPaymentOrder: unavailable,
    verifyPayment: unavailable,
    markPaymentFailed: unavailable,
  };
}

export function createPaymentService(env: Env, injectedGateway?: RazorpayGateway): PaymentAdapter {
  if (env.PAYMENT_MODE !== "razorpay" || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return unavailablePaymentAdapter();
  }

  const gateway = injectedGateway ?? new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  }) as unknown as RazorpayGateway;
  const keyId = env.RAZORPAY_KEY_ID;
  const secret = env.RAZORPAY_KEY_SECRET;

  return {
    async createPaymentOrder(input) {
      const prepared = await preparePaymentAttempt(input);
      let gatewayOrder: GatewayOrder | null = null;

      if (prepared.attempt.providerOrderId) {
        gatewayOrder = {
          id: prepared.attempt.providerOrderId,
          amount: prepared.amountPaise,
          currency: prepared.currency,
          receipt: prepared.attempt.receipt,
        };
      } else {
        gatewayOrder = await recoverOrCreateGatewayOrder(gateway, prepared);
        assertGatewayOrderMatchesAttempt(gatewayOrder, prepared);
        await persistGatewayOrder(prepared, gatewayOrder);
      }

      return {
        attemptId: prepared.attempt.id,
        providerOrderId: gatewayOrder.id,
        amount: prepared.amountPaise,
        currency: prepared.currency,
        keyId,
      };
    },

    async verifyPayment(input) {
      const context = await loadOwnedAttempt(input.userId, input.orderId, input.attemptId);
      if (!context.attempt.providerOrderId || context.attempt.providerOrderId !== input.providerOrderId) {
        throw new AppError("Gateway order does not match this payment attempt", "PAYMENT_ORDER_MISMATCH", 409);
      }
      if (!verifyCheckoutSignature({
        storedProviderOrderId: context.attempt.providerOrderId,
        providerPaymentId: input.providerPaymentId,
        signature: input.signature,
        secret,
      })) {
        throw new AppError("Invalid payment signature", "PAYMENT_VERIFICATION_FAILED", 400);
      }

      const gatewayPayment = await fetchGatewayPayment(gateway, input.providerPaymentId);
      assertCapturedPaymentMatches({
        payment: gatewayPayment,
        expectedPaymentId: input.providerPaymentId,
        expectedProviderOrderId: context.attempt.providerOrderId,
        expectedAmount: amountToMinorUnits(Number(context.attempt.amount)),
        expectedCurrency: context.attempt.currency,
      });

      return applyCapturedPayment(input, gatewayPayment.method);
    },

    async markPaymentFailed(input) {
      const context = await loadOwnedAttempt(input.userId, input.orderId, input.attemptId);
      if (!context.attempt.providerOrderId || context.attempt.providerOrderId !== input.providerOrderId) {
        throw new AppError("Gateway order does not match this payment attempt", "PAYMENT_ORDER_MISMATCH", 409);
      }
      const gatewayPayment = await fetchGatewayPayment(gateway, input.providerPaymentId);
      assertGatewayPaymentMatchesOrder({
        payment: gatewayPayment,
        expectedPaymentId: input.providerPaymentId,
        expectedProviderOrderId: context.attempt.providerOrderId,
        expectedAmount: amountToMinorUnits(Number(context.attempt.amount)),
        expectedCurrency: context.attempt.currency,
      });
      if (gatewayPayment.status !== "failed" || gatewayPayment.captured) {
        throw new AppError("Gateway does not report this payment as failed", "PAYMENT_NOT_FAILED", 409);
      }

      return recordFailedPayment(input, gatewayPayment.method);
    },
  };
}

async function preparePaymentAttempt(input: CreatePaymentOrderInput): Promise<PreparedAttempt> {
  if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128) {
    throw new AppError("Invalid payment idempotency key", "INVALID_IDEMPOTENCY_KEY", 400);
  }

  const requestHash = createHash("sha256")
    .update(JSON.stringify({ orderId: input.orderId }))
    .digest("hex");

  for (let attemptNumber = 0; attemptNumber < 3; attemptNumber += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: input.orderId, userId: input.userId },
          include: { payment: true },
        });
        if (!order?.payment) throw new AppError("Order not found", "ORDER_NOT_FOUND", 404);
        if (order.status !== OrderStatus.PENDING) {
          throw new AppError("Order is not eligible for payment", "PAYMENT_ORDER_INELIGIBLE", 409);
        }
        if (order.payment.status === PaymentStatus.CAPTURED || order.paymentStatus === PaymentStatus.CAPTURED) {
          throw new AppError("Order is already paid", "PAYMENT_ALREADY_CAPTURED", 409);
        }
        const retryablePaymentStatuses: PaymentStatus[] = [PaymentStatus.PENDING, PaymentStatus.FAILED];
        if (!retryablePaymentStatuses.includes(order.payment.status)) {
          throw new AppError("Payment is already being processed", "PAYMENT_ATTEMPT_IN_PROGRESS", 409);
        }

        const amountPaise = amountToMinorUnits(Number(order.grandTotal));
        if (order.currency !== "INR" || order.payment.currency !== "INR") {
          throw new AppError("Only INR payments are currently supported", "PAYMENT_CURRENCY_UNSUPPORTED", 409);
        }
        if (
          amountToMinorUnits(Number(order.payment.amount)) !== amountPaise ||
          order.payment.currency !== order.currency
        ) {
          throw new AppError("Stored payment does not match the order total", "PAYMENT_AMOUNT_MISMATCH", 409);
        }

        const existing = await tx.paymentAttempt.findUnique({
          where: {
            paymentId_idempotencyKey: {
              paymentId: order.payment.id,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new AppError("Payment idempotency key was reused", "PAYMENT_IDEMPOTENCY_KEY_REUSED", 409);
          }
          if (existing.status === PaymentStatus.FAILED) {
            throw new AppError("This payment attempt failed; start a new attempt", "PAYMENT_ATTEMPT_FAILED", 409);
          }
            return { attempt: existing, paymentId: order.payment.id, orderId: order.id, amountPaise, currency: order.payment.currency };
        }

        const activeAttempt = await tx.paymentAttempt.findFirst({
          where: { paymentId: order.payment.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] } },
          orderBy: { attemptNumber: "desc" },
        });
        if (activeAttempt) {
          if (activeAttempt.requestHash !== requestHash) {
            throw new AppError("A different payment attempt is still active", "PAYMENT_ATTEMPT_IN_PROGRESS", 409);
          }
          return { attempt: activeAttempt, paymentId: order.payment.id, orderId: order.id, amountPaise, currency: order.payment.currency };
        }

        const latest = await tx.paymentAttempt.findFirst({
          where: { paymentId: order.payment.id },
          orderBy: { attemptNumber: "desc" },
          select: { attemptNumber: true },
        });
        const created = await tx.paymentAttempt.create({
          data: {
            paymentId: order.payment.id,
            attemptNumber: (latest?.attemptNumber ?? 0) + 1,
            idempotencyKey: input.idempotencyKey,
            requestHash,
            receipt: randomUUID().replaceAll("-", ""),
            amount: order.payment.amount,
            currency: order.payment.currency,
            status: PaymentStatus.PENDING,
          },
        });

        if (order.payment.status === PaymentStatus.FAILED) {
          await tx.payment.update({
            where: { id: order.payment.id },
            data: {
              status: PaymentStatus.PENDING,
              providerOrderId: null,
              providerPaymentId: null,
              failureReason: null,
            },
          });
          await tx.order.update({ where: { id: order.id }, data: { paymentStatus: PaymentStatus.PENDING } });
        }
        return { attempt: created, paymentId: order.payment.id, orderId: order.id, amountPaise, currency: order.payment.currency };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (getPrismaErrorCode(error) === "P2034" && attemptNumber < 2) continue;
      if (getPrismaErrorCode(error) === "P2034" || getPrismaErrorCode(error) === "P2002") {
        const existing = await prisma.paymentAttempt.findUnique({
          where: { paymentId_idempotencyKey: { paymentId: await getOwnedPaymentId(input.userId, input.orderId), idempotencyKey: input.idempotencyKey } },
        });
        if (existing && existing.requestHash === requestHash && existing.status !== PaymentStatus.FAILED) {
          return {
            attempt: existing,
            paymentId: existing.paymentId,
            orderId: input.orderId,
            amountPaise: amountToMinorUnits(Number(existing.amount)),
            currency: existing.currency,
          };
        }
        if (attemptNumber < 2) continue;
      }
      throw error;
    }
  }
  throw new AppError("Could not initialize payment; retry with the same idempotency key", "PAYMENT_INITIALIZATION_UNCERTAIN", 503);
}

async function getOwnedPaymentId(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    select: { payment: { select: { id: true } } },
  });
  if (!order?.payment) throw new AppError("Order not found", "ORDER_NOT_FOUND", 404);
  return order.payment.id;
}

async function recoverOrCreateGatewayOrder(gateway: RazorpayGateway, prepared: PreparedAttempt) {
  try {
    const existing = await findGatewayOrderByReceipt(gateway, prepared.attempt.receipt);
    if (existing) return existing;
  } catch {
    throw new AppError("Payment provider status is unavailable; retry with the same idempotency key", "PAYMENT_INITIALIZATION_UNCERTAIN", 503);
  }

  try {
    return await gateway.orders.create({
      amount: prepared.amountPaise,
      currency: prepared.currency,
      receipt: prepared.attempt.receipt,
      notes: {
        vedaaOrderId: prepared.orderId,
        vedaaPaymentAttemptId: prepared.attempt.id,
      },
    });
  } catch {
    try {
      const recovered = await findGatewayOrderByReceipt(gateway, prepared.attempt.receipt);
      if (recovered) return recovered;
    } catch {
      // The order may have been created remotely while the response was lost.
    }
    throw new AppError("Payment order status is uncertain; retry with the same idempotency key", "PAYMENT_INITIALIZATION_UNCERTAIN", 503);
  }
}

async function findGatewayOrderByReceipt(gateway: RazorpayGateway, receipt: string) {
  const result = await gateway.orders.all({ receipt, count: 100 });
  const matches = result.items.filter((item) => item.receipt === receipt);
  if (matches.length > 1) {
    throw new AppError("Multiple gateway orders share this payment receipt", "PAYMENT_ORDER_AMBIGUOUS", 409);
  }
  return matches[0] ?? null;
}

function assertGatewayOrderMatchesAttempt(order: GatewayOrder, prepared: PreparedAttempt) {
  const notes = order.notes;
  if (
    order.receipt !== prepared.attempt.receipt ||
    order.amount !== prepared.amountPaise ||
    order.currency !== prepared.currency ||
    (notes?.vedaaPaymentAttemptId !== undefined && notes.vedaaPaymentAttemptId !== prepared.attempt.id)
  ) {
    throw new AppError("Gateway order does not match the payment attempt", "PAYMENT_ORDER_MISMATCH", 409);
  }
}

async function persistGatewayOrder(prepared: PreparedAttempt, order: GatewayOrder) {
  await prisma.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUnique({ where: { id: prepared.attempt.id } });
    if (!attempt) throw new AppError("Payment attempt not found", "PAYMENT_ATTEMPT_NOT_FOUND", 404);
    if (attempt.providerOrderId && attempt.providerOrderId !== order.id) {
      throw new AppError("Payment attempt is bound to another gateway order", "PAYMENT_ORDER_MISMATCH", 409);
    }
    const payment = await tx.payment.findUnique({
      where: { id: prepared.paymentId },
      include: { order: { select: { status: true } } },
    });
    if (!payment || payment.status === PaymentStatus.CAPTURED || payment.order.status !== OrderStatus.PENDING) {
      throw new AppError("Order payment is no longer eligible", "PAYMENT_ORDER_INELIGIBLE", 409);
    }
    await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { providerOrderId: order.id } });
    await tx.payment.update({
      where: { id: payment.id },
      data: { providerOrderId: order.id },
    });
  });
}

async function loadOwnedAttempt(userId: string, orderId: string, attemptId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: { payment: true },
  });
  if (!order?.payment) throw new AppError("Order not found", "ORDER_NOT_FOUND", 404);
  const attempt = await prisma.paymentAttempt.findFirst({
    where: { id: attemptId, paymentId: order.payment.id },
  });
  if (!attempt) throw new AppError("Payment attempt not found", "PAYMENT_ATTEMPT_NOT_FOUND", 404);
  return { order, payment: order.payment, attempt };
}

async function fetchGatewayPayment(gateway: RazorpayGateway, providerPaymentId: string) {
  try {
    return await gateway.payments.fetch(providerPaymentId);
  } catch {
    throw new AppError("Payment provider could not confirm this payment", "PAYMENT_STATUS_UNAVAILABLE", 503);
  }
}

function assertGatewayPaymentMatchesOrder(input: {
  payment: GatewayPayment;
  expectedPaymentId: string;
  expectedProviderOrderId: string;
  expectedAmount: number;
  expectedCurrency: string;
}) {
  if (
    input.payment.id !== input.expectedPaymentId ||
    input.payment.order_id !== input.expectedProviderOrderId ||
    input.payment.amount !== input.expectedAmount ||
    input.payment.currency !== input.expectedCurrency
  ) {
    throw new AppError("Gateway payment does not match this order", "PAYMENT_MISMATCH", 409);
  }
}

async function applyCapturedPayment(input: VerifyPaymentInput, method?: string): Promise<PaymentVerificationResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: input.orderId, userId: input.userId },
          include: { payment: true, items: true },
        });
        if (!order?.payment) throw new AppError("Order not found", "ORDER_NOT_FOUND", 404);
        const paymentAttempt = await tx.paymentAttempt.findFirst({
          where: { id: input.attemptId, paymentId: order.payment.id },
        });
        if (!paymentAttempt || paymentAttempt.providerOrderId !== input.providerOrderId) {
          throw new AppError("Payment attempt does not match this order", "PAYMENT_ATTEMPT_MISMATCH", 409);
        }

        if (paymentAttempt.status === PaymentStatus.CAPTURED && paymentAttempt.providerPaymentId === input.providerPaymentId) {
          return verificationResult(order, order.payment, true, order.status === OrderStatus.CANCELLED);
        }

        if (
          order.payment.status === PaymentStatus.CAPTURED &&
          order.payment.providerPaymentId === input.providerPaymentId
        ) {
          await tx.paymentAttempt.update({
            where: { id: paymentAttempt.id },
            data: { status: PaymentStatus.CAPTURED, providerPaymentId: input.providerPaymentId, method },
          });
          return verificationResult(order, order.payment, true, order.status !== OrderStatus.CONFIRMED);
        }

        if (order.payment.status === PaymentStatus.CAPTURED) {
          await tx.paymentAttempt.update({
            where: { id: paymentAttempt.id },
            data: {
              status: PaymentStatus.CAPTURED,
              providerPaymentId: input.providerPaymentId,
              failureReason: "CAPTURED_AFTER_ANOTHER_ATTEMPT",
              method,
            },
          });
          await tx.auditLog.create({
            data: {
              action: "PAYMENT_CAPTURE_REQUIRES_RECONCILIATION",
              entityType: "ORDER",
              entityId: order.id,
              metadata: { paymentAttemptId: paymentAttempt.id },
            },
          });
          return verificationResult(order, order.payment, false, true);
        }

        if (order.status === OrderStatus.CANCELLED) {
          const payment = await recordCapturedAggregate(
            tx, order, paymentAttempt.id, input, method, "PAYMENT_CAPTURED_AFTER_CANCELLATION",
          );
          return verificationResult(order, payment, false, true);
        }

        const outstanding = await getOutstandingOrderReservations(tx, order.id, order.items);
        if (order.status !== OrderStatus.PENDING || !hasFullReservation(outstanding, order.items)) {
          const payment = await recordCapturedAggregate(
            tx, order, paymentAttempt.id, input, method, "PAYMENT_CAPTURE_REQUIRES_RECONCILIATION",
          );
          return verificationResult(order, payment, false, true);
        }

        await finalizeReservedInventoryForOrder(tx, order.id, order.items);
        const payment = await tx.payment.update({
          where: { id: order.payment.id },
          data: {
            providerOrderId: input.providerOrderId,
            providerPaymentId: input.providerPaymentId,
            status: PaymentStatus.CAPTURED,
            method,
            failureReason: null,
          },
        });
        await tx.paymentAttempt.update({
          where: { id: paymentAttempt.id },
          data: {
            providerPaymentId: input.providerPaymentId,
            status: PaymentStatus.CAPTURED,
            method,
            failureReason: null,
          },
        });
        const updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.CONFIRMED, paymentStatus: PaymentStatus.CAPTURED },
        });
        await tx.auditLog.create({
          data: {
            action: "PAYMENT_CAPTURE_VERIFIED",
            entityType: "ORDER",
            entityId: order.id,
            metadata: { paymentAttemptId: paymentAttempt.id },
          },
        });
        return {
          verified: true,
          replayed: false,
          reconciliationRequired: false,
          orderStatus: updatedOrder.status,
          paymentStatus: payment.status,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (getPrismaErrorCode(error) === "P2034" && attempt < 2) continue;
      if (getPrismaErrorCode(error) === "P2002") {
        throw new AppError("This gateway payment is already associated with another payment attempt", "PAYMENT_ALREADY_USED", 409);
      }
      if (error instanceof AppError && error.code === "INVENTORY_RESERVATION_MISMATCH") {
        return recordCaptureForReconciliation(input, method, "PAYMENT_CAPTURE_INVENTORY_RECONCILIATION");
      }
      if (getPrismaErrorCode(error) === "P2034") {
        throw new AppError("Payment verification conflicted with another order update; retry", "PAYMENT_VERIFICATION_CONFLICT", 409);
      }
      throw error;
    }
  }
  throw new AppError("Payment verification conflicted with another order update; retry", "PAYMENT_VERIFICATION_CONFLICT", 409);
}

async function recordCaptureForReconciliation(
  input: VerifyPaymentInput,
  method: string | undefined,
  auditAction: string,
): Promise<PaymentVerificationResult> {
  for (let retry = 0; retry < 3; retry += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: input.orderId, userId: input.userId },
          include: { payment: true },
        });
        if (!order?.payment) throw new AppError("Order not found", "ORDER_NOT_FOUND", 404);
        const paymentAttempt = await tx.paymentAttempt.findFirst({
          where: { id: input.attemptId, paymentId: order.payment.id },
        });
        if (!paymentAttempt || paymentAttempt.providerOrderId !== input.providerOrderId) {
          throw new AppError("Payment attempt does not match this order", "PAYMENT_ATTEMPT_MISMATCH", 409);
        }
        if (order.payment.status === PaymentStatus.CAPTURED) {
          if (order.payment.providerPaymentId === input.providerPaymentId) {
            return verificationResult(order, order.payment, true, order.status !== OrderStatus.CONFIRMED);
          }
          throw new AppError("A different payment was already captured for this order", "PAYMENT_ALREADY_USED", 409);
        }
        const payment = await recordCapturedAggregate(
          tx,
          { ...order, items: [] },
          paymentAttempt.id,
          input,
          method,
          auditAction,
        );
        return verificationResult(order, payment, false, true);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (getPrismaErrorCode(error) === "P2034" && retry < 2) continue;
      if (getPrismaErrorCode(error) === "P2034") {
        throw new AppError("Payment reconciliation conflicted with another update; retry", "PAYMENT_VERIFICATION_CONFLICT", 409);
      }
      if (getPrismaErrorCode(error) === "P2002") {
        throw new AppError("This gateway payment is already associated with another payment attempt", "PAYMENT_ALREADY_USED", 409);
      }
      throw error;
    }
  }
  throw new AppError("Payment reconciliation conflicted with another update; retry", "PAYMENT_VERIFICATION_CONFLICT", 409);
}

async function recordCapturedAggregate(
  tx: Prisma.TransactionClient,
  order: Prisma.OrderGetPayload<{ include: { payment: true; items: true } }>,
  attemptId: string,
  input: VerifyPaymentInput,
  method: string | undefined,
  auditAction: string,
) {
  await tx.paymentAttempt.update({
    where: { id: attemptId },
    data: {
      providerPaymentId: input.providerPaymentId,
      status: PaymentStatus.CAPTURED,
      failureReason: "CAPTURED_REQUIRES_RECONCILIATION",
      method,
    },
  });
  const payment = await tx.payment.update({
    where: { id: order.payment!.id },
    data: {
      providerOrderId: input.providerOrderId,
      providerPaymentId: input.providerPaymentId,
      status: PaymentStatus.CAPTURED,
      failureReason: "CAPTURED_REQUIRES_RECONCILIATION",
      method,
    },
  });
  await tx.order.update({ where: { id: order.id }, data: { paymentStatus: PaymentStatus.CAPTURED } });
  await tx.auditLog.create({
    data: {
      action: auditAction,
      entityType: "ORDER",
      entityId: order.id,
      metadata: { paymentAttemptId: attemptId },
    },
  });
  return payment;
}

function hasFullReservation(
  reservations: Awaited<ReturnType<typeof getOutstandingOrderReservations>>,
  items: { productId: string; quantity: number }[],
) {
  if (!reservations) return false;
  const quantityByProduct = new Map<string, number>();
  for (const reservation of reservations) {
    quantityByProduct.set(
      reservation.productId,
      (quantityByProduct.get(reservation.productId) ?? 0) + reservation.quantity,
    );
  }
  return items.every((item) => quantityByProduct.get(item.productId) === item.quantity);
}

function verificationResult(
  order: { status: OrderStatus; paymentStatus: PaymentStatus },
  payment: { status: PaymentStatus },
  replayed: boolean,
  reconciliationRequired: boolean,
): PaymentVerificationResult {
  return {
    verified: true,
    replayed,
    reconciliationRequired,
    orderStatus: order.status,
    paymentStatus: payment.status,
  };
}

async function recordFailedPayment(input: Omit<VerifyPaymentInput, "signature">, method?: string) {
  for (let retry = 0; retry < 3; retry += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: input.orderId, userId: input.userId },
          include: { payment: true },
        });
        if (!order?.payment) throw new AppError("Order not found", "ORDER_NOT_FOUND", 404);
        const attempt = await tx.paymentAttempt.findFirst({
          where: { id: input.attemptId, paymentId: order.payment.id },
        });
        if (!attempt || attempt.providerOrderId !== input.providerOrderId) {
          throw new AppError("Payment attempt does not match this order", "PAYMENT_ATTEMPT_MISMATCH", 409);
        }
        if (attempt.status === PaymentStatus.CAPTURED || order.payment.status === PaymentStatus.CAPTURED) {
          return { failed: false, replayed: true };
        }
        if (attempt.status === PaymentStatus.FAILED && attempt.providerPaymentId === input.providerPaymentId) {
          return { failed: true, replayed: true };
        }
        if (order.status !== OrderStatus.PENDING || order.payment.providerOrderId !== input.providerOrderId) {
          throw new AppError("Payment attempt is no longer active", "PAYMENT_ATTEMPT_INACTIVE", 409);
        }
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: { providerPaymentId: input.providerPaymentId, status: PaymentStatus.FAILED, method, failureReason: "Gateway reported failed" },
        });
        await tx.payment.update({
          where: { id: order.payment.id },
          data: { providerPaymentId: input.providerPaymentId, status: PaymentStatus.FAILED, method, failureReason: "Gateway reported failed" },
        });
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: PaymentStatus.FAILED } });
        await tx.auditLog.create({
          data: {
            action: "PAYMENT_FAILED_VERIFIED",
            entityType: "ORDER",
            entityId: order.id,
            metadata: { paymentAttemptId: attempt.id },
          },
        });
        return { failed: true, replayed: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (getPrismaErrorCode(error) === "P2034" && retry < 2) continue;
      if (getPrismaErrorCode(error) === "P2034") {
        throw new AppError("Payment failure update conflicted with another update; refresh", "PAYMENT_VERIFICATION_CONFLICT", 409);
      }
      throw error;
    }
  }
  throw new AppError("Payment failure update conflicted with another update; refresh", "PAYMENT_VERIFICATION_CONFLICT", 409);
}

function getPrismaErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return undefined;
}

export async function handleRazorpayWebhook(
  _env: Env,
  _rawBody: string,
  _signature: string | undefined,
) {
  throw new AppError("Razorpay webhook processing is not enabled yet", "WEBHOOK_NOT_READY", 503);
}