import { OrderStatus, PaymentStatus, Prisma, prisma } from "@vedaa/database";
import { AppError } from "@vedaa/shared";
import { assertStoreAccess, type SessionUser } from "../../middleware/session.js";
import { assertStaffOrderTransition, getAllowedStaffTransitions } from "./order-transition.service.js";

const staffRoles = ["ADMIN", "STORE_MANAGER", "STORE_STAFF"];

export async function listStaffOrders(input: {
  user: SessionUser;
  storeId?: string;
  status?: OrderStatus;
  deliveryDate?: string;
  page: number;
  limit: number;
}) {
  return prisma.$transaction(async (tx) => {
    const storeIds = await resolveStoreScope(tx, input.user, input.storeId);
    const where = {
      storeId: { in: storeIds },
      ...(input.status ? { status: input.status } : {}),
      ...(input.deliveryDate ? { deliveryDate: new Date(`${input.deliveryDate}T00:00:00.000Z`) } : {}),
    };
    const [orders, total] = await Promise.all([
      tx.order.findMany({
        where,
        orderBy: [{ deliveryDate: "asc" }, { scheduledDeliveryAt: "asc" }, { id: "asc" }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          status: true,
          paymentStatus: true,
          currency: true,
          grandTotal: true,
          deliverySlotId: true,
          deliveryDate: true,
          scheduledDeliveryAt: true,
          deliveryWindowLabel: true,
          store: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      tx.order.count({ where }),
    ]);

    return {
      data: orders.map((order) => ({
        ...order,
        deliveryDate: order.deliveryDate.toISOString().slice(0, 10),
        itemCount: order._count.items,
        _count: undefined,
      })),
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
      stores: await tx.store.findMany({
        where: { id: { in: storeIds } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getStaffOrder(input: {
  user: SessionUser;
  orderId: string;
  storeId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const storeIds = await resolveStoreScope(tx, input.user, input.storeId);
    const order = await tx.order.findFirst({
      where: { id: input.orderId, storeId: { in: storeIds } },
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
        store: { select: { id: true, name: true } },
        user: { select: { name: true } },
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
        items: {
          select: {
            id: true,
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
        payment: {
          select: { status: true, amount: true, currency: true, method: true, createdAt: true },
        },
        delivery: {
          select: { slotId: true, scheduledAt: true, deliveredAt: true, notes: true },
        },
      },
    });
    if (!order) throw new AppError("Order not found", "ORDER_NOT_FOUND", 404);

    const paymentCaptured =
      order.paymentStatus === PaymentStatus.CAPTURED &&
      order.payment?.status === PaymentStatus.CAPTURED;
    return {
      ...order,
      customerName: order.addressSnapshot && typeof order.addressSnapshot === "object" && "recipientName" in order.addressSnapshot
        ? order.addressSnapshot.recipientName
        : order.address.recipientName ?? order.user.name,
      address: order.addressSnapshot ?? order.address,
      addressSnapshotAvailable: order.addressSnapshot !== null,
      delivery: {
        slotId: order.deliverySlotId,
        deliveryDate: order.deliveryDate.toISOString().slice(0, 10),
        scheduledAt: order.scheduledDeliveryAt,
        deliveryWindowLabel: order.deliveryWindowLabel,
        deliveredAt: order.delivery?.deliveredAt ?? null,
        notes: order.delivery?.notes ?? null,
      },
      allowedNextStatuses: getAllowedStaffTransitions(
        order.status,
        paymentCaptured ? order.paymentStatus : PaymentStatus.PENDING,
      ),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function transitionStaffOrder(input: {
  user: SessionUser;
  orderId: string;
  nextStatus: OrderStatus;
  expectedStatus: OrderStatus;
  storeId?: string;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const storeIds = await resolveStoreScope(tx, input.user, input.storeId);
        const order = await tx.order.findFirst({
          where: { id: input.orderId, storeId: { in: storeIds } },
          select: {
            id: true,
            storeId: true,
            status: true,
            paymentStatus: true,
            payment: { select: { status: true } },
          },
        });
        if (!order) throw new AppError("Order not found", "ORDER_NOT_FOUND", 404);
        if (order.status !== input.expectedStatus) {
          throw new AppError("Order status changed; refresh before updating", "STALE_ORDER_STATUS", 409);
        }
        if (order.payment?.status !== PaymentStatus.CAPTURED) {
          throw new AppError("Order must have a captured payment before staff processing", "ORDER_PAYMENT_REQUIRED", 409);
        }
        assertStaffOrderTransition(order.status, input.nextStatus, order.paymentStatus);

        const changed = await tx.order.updateMany({
          where: {
            id: order.id,
            storeId: order.storeId,
            status: input.expectedStatus,
            paymentStatus: order.paymentStatus,
          },
          data: { status: input.nextStatus },
        });
        if (changed.count !== 1) {
          throw new AppError("Order status changed; refresh before updating", "STALE_ORDER_STATUS", 409);
        }

        await tx.auditLog.create({
          data: {
            actorId: input.user.id,
            action: "ORDER_STATUS_CHANGED",
            entityType: "ORDER",
            entityId: order.id,
            metadata: {
              storeId: order.storeId,
              fromStatus: order.status,
              toStatus: input.nextStatus,
              paymentStatus: order.paymentStatus,
            },
          },
        });

        return {
          data: await tx.order.findUniqueOrThrow({
            where: { id: order.id },
            select: {
              id: true,
              orderNumber: true,
              status: true,
              paymentStatus: true,
              updatedAt: true,
            },
          }),
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (getPrismaErrorCode(error) === "P2034" && attempt < 2) continue;
      if (getPrismaErrorCode(error) === "P2034") {
        throw new AppError("Order changed concurrently; refresh and retry", "STALE_ORDER_STATUS", 409);
      }
      throw error;
    }
  }

  throw new AppError("Order changed concurrently; refresh and retry", "STALE_ORDER_STATUS", 409);
}

async function resolveStoreScope(
  tx: Prisma.TransactionClient,
  user: SessionUser,
  requestedStoreId?: string,
) {
  if (!staffRoles.includes(user.role)) {
    throw new AppError("Staff access required", "FORBIDDEN", 403);
  }

  if (user.role === "ADMIN") {
    if (requestedStoreId) {
      const store = await tx.store.findUnique({ where: { id: requestedStoreId }, select: { id: true } });
      if (!store) throw new AppError("Store not found", "STORE_NOT_FOUND", 404);
      return [store.id];
    }
    const stores = await tx.store.findMany({ select: { id: true }, orderBy: { name: "asc" } });
    return stores.map(({ id }) => id);
  }

  const memberships = await tx.storeStaff.findMany({
    where: { userId: user.id, role: user.role as "STORE_MANAGER" | "STORE_STAFF" },
    select: { storeId: true },
  });
  const authorizedStoreIds = memberships.map(({ storeId }) => storeId);
  if (requestedStoreId) {
    assertStoreAccess(user, requestedStoreId, authorizedStoreIds);
    return [requestedStoreId];
  }
  if (authorizedStoreIds.length === 0) {
    throw new AppError("Store access required", "FORBIDDEN", 403);
  }
  return authorizedStoreIds;
}

function getPrismaErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return undefined;
}