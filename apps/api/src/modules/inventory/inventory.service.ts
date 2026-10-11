import { prisma, type Prisma } from "@vedaa/database";
import { AppError } from "@vedaa/shared";

export async function reserveInventory(
  tx: Prisma.TransactionClient,
  storeId: string,
  items: { productId: string; quantity: number }[],
  orderId?: string,
) {
  const orderedItems = [...items].sort((left, right) => left.productId.localeCompare(right.productId));
  for (const item of orderedItems) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
      throw new AppError("Quantity must be between 1 and 20", "INVALID_QUANTITY", 400);
    }

    const updated = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "StoreInventory"
      SET "reservedQuantity" = "reservedQuantity" + ${item.quantity},
          "reservedStock" = "reservedQuantity" + ${item.quantity},
          "availableStock" = "stockQuantity" - ("reservedQuantity" + ${item.quantity}),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "storeId" = ${storeId}
        AND "productId" = ${item.productId}
        AND "isAvailable" = TRUE
        AND "stockQuantity" - "reservedQuantity" >= ${item.quantity}
      RETURNING "id"
    `;

    if (updated.length !== 1) {
      throw new AppError("Insufficient stock", "INSUFFICIENT_STOCK", 409);
    }

    await tx.inventoryMovement.create({
      data: {
        inventoryId: updated[0].id,
        storeId,
        productId: item.productId,
        type: "RESERVATION",
        quantity: item.quantity,
        reference: "order",
        referenceId: orderId,
      },
    });
  }
}

type OrderQuantity = { productId: string; quantity: number };

type OutstandingReservation = {
  inventoryId: string;
  storeId: string;
  productId: string;
  quantity: number;
};

export async function getOutstandingOrderReservations(
  tx: Prisma.TransactionClient,
  orderId: string,
  items: OrderQuantity[],
): Promise<OutstandingReservation[] | null> {
  const movements = await tx.inventoryMovement.findMany({
    where: {
      referenceId: orderId,
      type: { in: ["RESERVATION", "RELEASE", "SALE"] },
    },
    select: { inventoryId: true, storeId: true, productId: true, type: true, quantity: true },
  });
  const expectedByProduct = new Map<string, number>();
  for (const item of items) {
    expectedByProduct.set(
      item.productId,
      (expectedByProduct.get(item.productId) ?? 0) + item.quantity,
    );
  }

  const ledgerByProduct = new Map<string, Map<string, {
    inventoryId: string;
    storeId: string | null;
    reserved: number;
    released: number;
    sold: number;
  }>>();
  for (const movement of movements) {
    if (!movement.productId || !expectedByProduct.has(movement.productId)) return null;
    const productLedger = ledgerByProduct.get(movement.productId) ?? new Map();
    const ledger = productLedger.get(movement.inventoryId) ?? {
      inventoryId: movement.inventoryId,
      storeId: movement.storeId,
      reserved: 0,
      released: 0,
      sold: 0,
    };
    if (movement.type === "RESERVATION") ledger.reserved += movement.quantity;
    if (movement.type === "RELEASE") ledger.released += movement.quantity;
    if (movement.type === "SALE") ledger.sold += movement.quantity;
    productLedger.set(movement.inventoryId, ledger);
    ledgerByProduct.set(movement.productId, productLedger);
  }

  const outstanding: OutstandingReservation[] = [];
  for (const [productId, expectedQuantity] of expectedByProduct) {
    const productLedger = ledgerByProduct.get(productId);
    if (!productLedger) return null;
    const reservedTotal = [...productLedger.values()].reduce((sum, entry) => sum + entry.reserved, 0);
    const releasedTotal = [...productLedger.values()].reduce((sum, entry) => sum + entry.released, 0);
    const soldTotal = [...productLedger.values()].reduce((sum, entry) => sum + entry.sold, 0);
    if (reservedTotal !== expectedQuantity || releasedTotal + soldTotal > reservedTotal) return null;

    for (const entry of productLedger.values()) {
      const quantity = entry.reserved - entry.released - entry.sold;
      if (quantity < 0 || (quantity > 0 && !entry.storeId)) return null;
      if (quantity > 0) {
        outstanding.push({
          inventoryId: entry.inventoryId,
          storeId: entry.storeId!,
          productId,
          quantity,
        });
      }
    }
  }

  return outstanding;
}

export async function releaseInventoryForOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  items: OrderQuantity[],
) {
  const reservations = await getOutstandingOrderReservations(tx, orderId, items);
  if (!reservations) {
    throw new AppError(
      "This order does not have a safely attributable inventory reservation",
      "CANCELLATION_UNSAFE",
      409,
    );
  }

  for (const reservation of reservations) {
    const updated = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "StoreInventory"
      SET "reservedQuantity" = "reservedQuantity" - ${reservation.quantity},
          "reservedStock" = "reservedQuantity" - ${reservation.quantity},
          "availableStock" = "stockQuantity" - ("reservedQuantity" - ${reservation.quantity}),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${reservation.inventoryId}
        AND "reservedQuantity" >= ${reservation.quantity}
      RETURNING "id"
    `;
    if (updated.length !== 1) {
      throw new AppError(
        "Inventory reservation state is inconsistent",
        "INVENTORY_RESERVATION_MISMATCH",
        409,
      );
    }

    await tx.inventoryMovement.create({
      data: {
        inventoryId: reservation.inventoryId,
        storeId: reservation.storeId,
        productId: reservation.productId,
        type: "RELEASE",
        quantity: reservation.quantity,
        reference: orderId,
        referenceId: orderId,
        reason: "Order cancelled",
      },
    });
  }
}

export async function finalizeReservedInventoryForOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  items: OrderQuantity[],
) {
  const reservations = await getOutstandingOrderReservations(tx, orderId, items);
  if (!reservations) {
    throw new AppError("Order inventory reservation cannot be verified", "INVENTORY_RESERVATION_MISMATCH", 409);
  }

  const outstandingByProduct = new Map<string, number>();
  for (const reservation of reservations) {
    outstandingByProduct.set(
      reservation.productId,
      (outstandingByProduct.get(reservation.productId) ?? 0) + reservation.quantity,
    );
  }
  if (items.some((item) => outstandingByProduct.get(item.productId) !== item.quantity)) {
    throw new AppError("Order inventory reservation is no longer available", "INVENTORY_RESERVATION_MISMATCH", 409);
  }

  for (const reservation of reservations) {
    const updated = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "StoreInventory"
      SET "stockQuantity" = "stockQuantity" - ${reservation.quantity},
          "reservedQuantity" = "reservedQuantity" - ${reservation.quantity},
          "reservedStock" = "reservedQuantity" - ${reservation.quantity},
          "availableStock" = "stockQuantity" - "reservedQuantity",
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${reservation.inventoryId}
        AND "stockQuantity" >= ${reservation.quantity}
        AND "reservedQuantity" >= ${reservation.quantity}
      RETURNING "id"
    `;
    if (updated.length !== 1) {
      throw new AppError("Inventory changed during payment capture", "INVENTORY_RESERVATION_MISMATCH", 409);
    }

    await tx.inventoryMovement.create({
      data: {
        inventoryId: reservation.inventoryId,
        storeId: reservation.storeId,
        productId: reservation.productId,
        type: "SALE",
        quantity: reservation.quantity,
        reference: orderId,
        referenceId: orderId,
      },
    });
  }
}

