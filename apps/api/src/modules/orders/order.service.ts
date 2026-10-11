import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import { prisma, OrderStatus, PaymentStatus, Prisma } from "@vedaa/database";
import { AppError } from "@vedaa/shared";
import { BUSINESS_TIMEZONE } from "@vedaa/shared";
import { assignDeliverySlot } from "../delivery/delivery-schedule.service.js";
import { calculateCartTotals } from "../pricing/pricing.service.js";
import {
  getOutstandingOrderReservations,
  releaseInventoryForOrder,
  reserveInventory,
} from "../inventory/inventory.service.js";

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { items: true; payment: true; delivery: true };
}>;

type DeliverySummary = {
  slotId: string;
  deliveryDate: string;
  deliveryTime: string;
  scheduledDeliveryAt: string;
  label: string;
  timezone: string;
};

const orderInclude = { items: true, payment: true, delivery: true } as const;

function generateOrderNumber(): string {
  const n = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VM-${n}-${r}`;
}

export async function createOrder(input: {
  userId: string;
  addressId: string;
  couponCode?: string;
  idempotencyKey: string;
}): Promise<{ order: OrderWithRelations; delivery: DeliverySummary; replayed: boolean }> {
  const couponCode = input.couponCode?.trim().toUpperCase() || undefined;
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ addressId: input.addressId, couponCode }))
    .digest("hex");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.order.findUnique({
          where: {
            userId_idempotencyKey: {
              userId: input.userId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: orderInclude,
        });
        if (existing) {
          assertSameRequest(existing.idempotencyRequestHash, requestHash);
          return { order: existing, delivery: getPersistedDelivery(existing), replayed: true };
        }

        const context = await loadCheckoutContext(
          tx,
          input.userId,
          input.addressId,
          couponCode,
        );
        const orderedAt = new Date();
        const delivery = assignDeliverySlot(orderedAt);
        const cartItems = context.cart.items.map(({ productId, quantity }) => ({
          productId,
          quantity,
        }));

        if (!context.cart.storeId) {
          await tx.cart.update({ where: { id: context.cart.id }, data: { storeId: context.store.id } });
        }
        const created = await tx.order.create({
          data: {
            orderNumber: generateOrderNumber(),
            userId: input.userId,
            storeId: context.store.id,
            addressId: context.address.id,
            addressSnapshot: {
              recipientName: context.address.recipientName,
              phone: context.address.phone,
              label: context.address.label,
              line1: context.address.line1,
              line2: context.address.line2,
              landmark: context.address.landmark,
              city: context.address.city,
              state: context.address.state,
              postalCode: context.address.postalCode,
              country: context.address.country,
            },
            status: OrderStatus.PENDING,
            paymentStatus: PaymentStatus.PENDING,
            orderedAt,
            deliverySlotId: delivery.slotId,
            deliveryDate: new Date(`${delivery.deliveryDate}T00:00:00.000Z`),
            scheduledDeliveryAt: new Date(delivery.scheduledDeliveryAt),
            deliveryWindowLabel: delivery.label,
            subtotal: context.totals.subtotal,
            discountTotal: context.totals.discountTotal,
            deliveryFee: context.totals.deliveryFee,
            handlingFee: context.totals.handlingFee,
            taxTotal: context.totals.taxTotal,
            grandTotal: context.totals.grandTotal,
            couponCode,
            idempotencyKey: input.idempotencyKey,
            idempotencyRequestHash: requestHash,
            items: {
              create: context.totals.lines.map((line) => ({
                productId: line.productId,
                productName: line.productName,
                productSku: line.productSku,
                brand: line.brand,
                packageSize: line.packageSize,
                quantity: line.quantity,
                unitMrp: line.unitMrp,
                unitSellingPrice: line.unitSellingPrice,
                lineTotal: line.lineTotal,
              })),
            },
            payment: {
              create: { amount: context.totals.grandTotal, status: PaymentStatus.PENDING },
            },
            delivery: {
              create: {
                slotId: delivery.slotId,
                scheduledAt: new Date(delivery.scheduledDeliveryAt),
              },
            },
          },
          include: orderInclude,
        });

        await reserveInventory(tx, context.store.id, cartItems, created.id);

        if (couponCode) {
          const coupon = await tx.coupon.findUnique({ where: { code: couponCode } });
          if (coupon) {
            const updatedCoupon = await tx.coupon.updateMany({
              where: {
                id: coupon.id,
                ...(coupon.usageLimit === null ? {} : { usedCount: { lt: coupon.usageLimit } }),
              },
              data: { usedCount: { increment: 1 } },
            });
            if (updatedCoupon.count !== 1) {
              throw new AppError("Coupon usage limit reached", "INVALID_COUPON", 400);
            }
            await tx.couponRedemption.create({
              data: { couponId: coupon.id, userId: input.userId, orderId: created.id },
            });
          }
        }

        const cleared = await tx.cartItem.deleteMany({
          where: {
            cartId: context.cart.id,
            OR: context.cart.items.map(({ id, quantity }) => ({ id, quantity })),
          },
        });
        if (cleared.count !== context.cart.items.length) {
          throw new AppError("Cart changed during checkout", "CART_CHANGED", 409);
        }

        return {
          order: created,
          delivery: {
            slotId: delivery.slotId,
            deliveryDate: delivery.deliveryDate,
            deliveryTime: delivery.deliveryTime,
            scheduledDeliveryAt: delivery.scheduledDeliveryAt,
            label: delivery.label,
            timezone: delivery.timezone,
          },
          replayed: false,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const code = getPrismaErrorCode(error);
      if (code === "P2034") {
        const existing = await findIdempotentOrder(input.userId, input.idempotencyKey);
        if (existing) {
          assertSameRequest(existing.idempotencyRequestHash, requestHash);
          return { order: existing, delivery: getPersistedDelivery(existing), replayed: true };
        }
        if (attempt < 2) continue;
      }
      if (code === "P2002") {
        const existing = await findIdempotentOrder(input.userId, input.idempotencyKey);
        if (existing) {
          assertSameRequest(existing.idempotencyRequestHash, requestHash);
          return { order: existing, delivery: getPersistedDelivery(existing), replayed: true };
        }
      }
      if (code === "P2034") {
        throw new AppError("Checkout conflicted with another update; retry the request", "ORDER_CONFLICT", 409);
      }
      throw error;
    }
  }

  throw new AppError("Unable to create order", "ORDER_CONFLICT", 409);
}

export async function previewOrder(input: {
  userId: string;
  addressId: string;
  couponCode?: string;
}) {
  const couponCode = input.couponCode?.trim().toUpperCase() || undefined;
  return prisma.$transaction(async (tx) => {
    const context = await loadCheckoutContext(tx, input.userId, input.addressId, couponCode);
    const delivery = assignDeliverySlot(new Date());
    return {
      items: context.totals.lines,
      totals: {
        subtotal: context.totals.subtotal,
        discountTotal: context.totals.discountTotal,
        deliveryFee: context.totals.deliveryFee,
        handlingFee: context.totals.handlingFee,
        taxTotal: context.totals.taxTotal,
        grandTotal: context.totals.grandTotal,
      },
      delivery: {
        slotId: delivery.slotId,
        deliveryDate: delivery.deliveryDate,
        deliveryTime: delivery.deliveryTime,
        scheduledDeliveryAt: delivery.scheduledDeliveryAt,
        label: delivery.label,
        timezone: delivery.timezone,
      },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function loadCheckoutContext(
  client: Prisma.TransactionClient,
  userId: string,
  addressId: string,
  couponCode?: string,
) {
  const address = await client.address.findFirst({ where: { id: addressId, userId } });
  if (!address) throw new AppError("Address not found", "ADDRESS_NOT_FOUND", 404);
  if (!address.isServiceable) {
    throw new AppError("Address is not serviceable", "ADDRESS_NOT_SERVICEABLE", 400);
  }

  const cart = await client.cart.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { items: true },
  });
  if (!cart || cart.items.length === 0) {
    throw new AppError("Cart is empty", "EMPTY_CART", 400);
  }
  if (cart.items.some(({ quantity }) => !Number.isInteger(quantity) || quantity < 1 || quantity > 20)) {
    throw new AppError("Cart contains an invalid quantity", "INVALID_QUANTITY", 400);
  }

  const store = cart.storeId
    ? await client.store.findFirst({ where: { id: cart.storeId, isActive: true } })
    : await client.store.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  if (!store) throw new AppError("Store not available", "STORE_NOT_FOUND", 400);

  const totals = await calculateCartTotals(
    store.id,
    cart.items.map(({ productId, quantity }) => ({ productId, quantity })),
    couponCode,
    client,
  );
  return { address, cart, store, totals };
}

async function findIdempotentOrder(userId: string, idempotencyKey: string) {
  return prisma.order.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey } },
    include: orderInclude,
  });
}

function assertSameRequest(existingHash: string | null, requestHash: string) {
  if (existingHash !== requestHash) {
    throw new AppError(
      "Idempotency key was already used for a different checkout request",
      "IDEMPOTENCY_KEY_REUSED",
      409,
    );
  }
}

function getPersistedDelivery(order: OrderWithRelations): DeliverySummary {
  const scheduledAt = DateTime.fromJSDate(order.scheduledDeliveryAt, { zone: "utc" });
  return {
    slotId: order.deliverySlotId,
    deliveryDate: order.deliveryDate.toISOString().slice(0, 10),
    deliveryTime: scheduledAt.setZone(BUSINESS_TIMEZONE).toFormat("HH:mm"),
    scheduledDeliveryAt: order.scheduledDeliveryAt.toISOString(),
    label: order.deliveryWindowLabel ?? "Scheduled delivery",
    timezone: BUSINESS_TIMEZONE,
  };
}

function getPrismaErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return undefined;
}

export async function cancelOrder(userId: string, orderId: string, reason?: string) {
  const cancellableStatuses: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED];
  const cancellablePayments: PaymentStatus[] = [PaymentStatus.PENDING, PaymentStatus.FAILED];
  const normalizedReason = reason?.trim() || undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, userId },
          include: { items: true, payment: true },
        });
        if (!order) throw new AppError("Order not found", "ORDER_NOT_FOUND", 404);
        if (order.status === OrderStatus.CANCELLED) {
          return { order: cancellationReceipt(order), replayed: true };
        }
        if (!cancellableStatuses.includes(order.status)) {
          throw new AppError("Order can no longer be cancelled", "CANCEL_NOT_ALLOWED", 409);
        }
        if (
          !cancellablePayments.includes(order.paymentStatus) ||
          (order.payment && !cancellablePayments.includes(order.payment.status))
        ) {
          throw new AppError(
            "This payment state requires payment-provider handling before cancellation",
            "CANCEL_PAYMENT_UNSUPPORTED",
            409,
          );
        }

        const outstanding = await getOutstandingOrderReservations(tx, order.id, order.items);
        if (!outstanding) {
          throw new AppError(
            "This order does not have a safely attributable inventory reservation",
            "CANCELLATION_UNSAFE",
            409,
          );
        }

        const transition = await tx.order.updateMany({
          where: {
            id: order.id,
            userId,
            status: { in: cancellableStatuses },
            paymentStatus: { in: cancellablePayments },
          },
          data: {
            status: OrderStatus.CANCELLED,
            cancelledAt: new Date(),
            cancellationReason: normalizedReason,
          },
        });
        if (transition.count !== 1) {
          const current = await tx.order.findUnique({ where: { id: order.id } });
          if (current?.status === OrderStatus.CANCELLED) {
            return { order: cancellationReceipt(current), replayed: true };
          }
          throw new AppError("Order changed during cancellation", "CANCEL_CONFLICT", 409);
        }

        await releaseInventoryForOrder(tx, order.id, order.items);
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: "ORDER_CANCELLED",
            entityType: "ORDER",
            entityId: order.id,
            metadata: { reason: normalizedReason ?? null },
          },
        });

        const cancelled = await tx.order.findUniqueOrThrow({
          where: { id: order.id },
          select: cancellationReceiptSelect,
        });
        return { order: cancelled, replayed: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (getPrismaErrorCode(error) === "P2034" && attempt < 2) continue;
      if (getPrismaErrorCode(error) === "P2034") {
        throw new AppError("Cancellation conflicted with another update; retry", "CANCEL_CONFLICT", 409);
      }
      throw error;
    }
  }

  throw new AppError("Unable to cancel order", "CANCEL_CONFLICT", 409);
}

const cancellationReceiptSelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  cancelledAt: true,
  cancellationReason: true,
} as const;

function cancellationReceipt(order: {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    cancelledAt: order.cancelledAt,
    cancellationReason: order.cancellationReason,
  };
}

export async function getCustomerOrderDetail(userId: string, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        orderedAt: true,
        status: true,
        paymentStatus: true,
        currency: true,
        subtotal: true,
        discountTotal: true,
        deliveryFee: true,
        handlingFee: true,
        taxTotal: true,
        grandTotal: true,
        deliverySlotId: true,
        deliveryDate: true,
        scheduledDeliveryAt: true,
        deliveryWindowLabel: true,
        addressSnapshot: true,
        cancelledAt: true,
        cancellationReason: true,
        items: {
          select: {
            id: true,
            productId: true,
            productName: true,
            productSku: true,
            brand: true,
            packageSize: true,
            quantity: true,
            unitMrp: true,
            unitSellingPrice: true,
            lineTotal: true,
          },
        },
        address: {
          select: {
            recipientName: true,
            phone: true,
            label: true,
            line1: true,
            line2: true,
            landmark: true,
            city: true,
            state: true,
            postalCode: true,
            country: true,
          },
        },
        payment: {
          select: { status: true, amount: true, currency: true, method: true, createdAt: true },
        },
        delivery: {
          select: { slotId: true, scheduledAt: true, deliveredAt: true, notes: true },
        },
      },
    });
    if (!order) throw new AppError("Order not found", "ORDER_NOT_FOUND", 404);

    const canCancel = await canCustomerCancelOrder(tx, order);
    return {
      ...order,
      items: order.items.map(({ productId: _productId, ...item }) => item),
      address: order.addressSnapshot ?? order.address,
      addressSnapshotAvailable: order.addressSnapshot !== null,
      delivery: {
        slotId: order.deliverySlotId,
        deliveryDate: order.deliveryDate.toISOString().slice(0, 10),
        scheduledAt: order.scheduledDeliveryAt,
        deliveryWindowLabel: order.deliveryWindowLabel,
        timezone: BUSINESS_TIMEZONE,
        deliveredAt: order.delivery?.deliveredAt ?? null,
        notes: order.delivery?.notes ?? null,
      },
      canCancel,
    };
  });
}

async function canCustomerCancelOrder(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    items: { productId: string; quantity: number }[];
    payment: { status: PaymentStatus } | null;
  },
) {
  const cancellableStatuses: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED];
  const cancellablePayments: PaymentStatus[] = [PaymentStatus.PENDING, PaymentStatus.FAILED];
  if (!cancellableStatuses.includes(order.status)) return false;
  if (!cancellablePayments.includes(order.paymentStatus)) return false;
  if (order.payment && !cancellablePayments.includes(order.payment.status)) {
    return false;
  }
  return (await getOutstandingOrderReservations(tx, order.id, order.items)) !== null;
}

