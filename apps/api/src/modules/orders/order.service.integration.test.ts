import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeTestDatabase } from "../../test-utils/test-database.js";

const testDatabaseEnabled = initializeTestDatabase();
const modules = testDatabaseEnabled
  ? await Promise.all([
      import("@vedaa/database"),
      import("./order.service.js"),
      import("../delivery/delivery-schedule.service.js"),
      import("../inventory/inventory.service.js"),
    ])
  : undefined;
const prisma = modules?.[0].prisma as unknown as typeof import("@vedaa/database").prisma;
const createOrder = modules?.[1].createOrder as unknown as typeof import("./order.service.js").createOrder;
const cancelOrder = modules?.[1].cancelOrder as unknown as typeof import("./order.service.js").cancelOrder;
const assignDeliverySlot = modules?.[2].assignDeliverySlot as unknown as typeof import("../delivery/delivery-schedule.service.js").assignDeliverySlot;
const reserveInventory = modules?.[3].reserveInventory as unknown as typeof import("../inventory/inventory.service.js").reserveInventory;
const databaseDescribe = testDatabaseEnabled ? describe : describe.skip;

type CustomerFixture = {
  userId: string;
  addressId: string;
  cartId: string;
};

type Fixture = {
  suffix: string;
  storeId: string;
  categoryId: string;
  productId: string;
  inventoryId: string;
  customer: CustomerFixture;
};

let fixture: Fixture;
let customerIds: string[];

function uniqueSuffix() {
  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

async function createCustomer(suffix: string, storeId: string, productId: string, quantity?: number) {
  const user = await prisma.user.create({
    data: { email: `order-test-${suffix}@example.invalid`, name: "Order Test" },
  });
  customerIds.push(user.id);
  const address = await prisma.address.create({
    data: {
      userId: user.id,
      label: "Test Home",
      line1: `1 Test Street ${suffix}`,
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      isServiceable: true,
    },
  });
  const cart = await prisma.cart.create({ data: { userId: user.id, storeId } });
  if (quantity !== undefined) {
    await prisma.cartItem.create({ data: { cartId: cart.id, productId, quantity } });
  }
  return { userId: user.id, addressId: address.id, cartId: cart.id };
}

function orderInput(customer = fixture.customer, key = `checkout-${uniqueSuffix()}`) {
  return { userId: customer.userId, addressId: customer.addressId, idempotencyKey: key };
}

databaseDescribe("createOrder (PostgreSQL integration)", () => {
  beforeEach(async () => {
    const suffix = uniqueSuffix();
    customerIds = [];
    const store = await prisma.store.create({
      data: {
        name: `Order Test Store ${suffix}`,
        slug: `order-test-store-${suffix}`,
        addressLine: "1 Test Road",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
      },
    });
    const category = await prisma.category.create({
      data: { name: `Order Test ${suffix}`, slug: `order-test-category-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: "Test Rice",
        slug: `order-test-product-${suffix}`,
        sku: `ORDER-TEST-${suffix}`,
        categoryId: category.id,
        mrp: 120,
        sellingPrice: 100,
      },
    });
    const inventory = await prisma.storeInventory.create({
      data: {
        storeId: store.id,
        productId: product.id,
        stockQuantity: 5,
        availableStock: 5,
        reservedQuantity: 0,
        reservedStock: 0,
      },
    });
    const customer = await createCustomer(suffix, store.id, product.id, 2);
    fixture = {
      suffix,
      storeId: store.id,
      categoryId: category.id,
      productId: product.id,
      inventoryId: inventory.id,
      customer,
    };
  });

  afterEach(async () => {
    if (!fixture) return;
    const orders = await prisma.order.findMany({
      where: { userId: { in: customerIds } },
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: orders.map(({ id }) => id) } } });
    await prisma.order.deleteMany({ where: { userId: { in: customerIds } } });
    await prisma.cart.deleteMany({ where: { userId: { in: customerIds } } });
    await prisma.address.deleteMany({ where: { userId: { in: customerIds } } });
    await prisma.storeInventory.deleteMany({ where: { storeId: fixture.storeId } });
    await prisma.product.deleteMany({ where: { id: fixture.productId } });
    await prisma.category.deleteMany({ where: { id: fixture.categoryId } });
    await prisma.store.deleteMany({ where: { id: fixture.storeId } });
    await prisma.user.deleteMany({ where: { id: { in: customerIds } } });
    fixture = undefined as unknown as Fixture;
  });

  it("rejects an empty cart", async () => {
    await prisma.cartItem.deleteMany({ where: { cartId: fixture.customer.cartId } });
    await expect(createOrder(orderInput())).rejects.toMatchObject({ code: "EMPTY_CART" });
  });

  it("rejects an address belonging to another customer", async () => {
    const otherCustomer = await createCustomer(uniqueSuffix(), fixture.storeId, fixture.productId);
    await expect(createOrder({
      ...orderInput(),
      addressId: otherCustomer.addressId,
    })).rejects.toMatchObject({ code: "ADDRESS_NOT_FOUND" });
  });

  it("rejects an unserviceable address and inactive store", async () => {
    await prisma.address.update({
      where: { id: fixture.customer.addressId },
      data: { isServiceable: false },
    });
    await expect(createOrder(orderInput())).rejects.toMatchObject({ code: "ADDRESS_NOT_SERVICEABLE" });

    await prisma.address.update({
      where: { id: fixture.customer.addressId },
      data: { isServiceable: true },
    });
    await prisma.store.update({ where: { id: fixture.storeId }, data: { isActive: false } });
    await expect(createOrder(orderInput())).rejects.toMatchObject({ code: "STORE_NOT_FOUND" });
  });

  it("uses database prices and stores item, address, and delivery snapshots", async () => {
    const result = await createOrder(orderInput());
    const expectedDelivery = assignDeliverySlot(result.order.orderedAt);
    const item = result.order.items[0];

    expect(item).toMatchObject({
      productId: fixture.productId,
      productName: "Test Rice",
      quantity: 2,
    });
    expect(Number(item.unitSellingPrice)).toBe(100);
    expect(Number(item.lineTotal)).toBe(200);
    expect(Number(result.order.grandTotal)).toBe(229);
    expect(result.order.paymentStatus).toBe("PENDING");
    expect(result.order.addressSnapshot).toMatchObject({
      line1: expect.stringContaining("Test Street"),
      postalCode: "560001",
    });
    expect(result.order.deliverySlotId).toBe(expectedDelivery.slotId);
    expect(result.order.scheduledDeliveryAt.toISOString()).toBe(expectedDelivery.scheduledDeliveryAt);
    expect(result.delivery.timezone).toBe("Asia/Kolkata");
    expect(await prisma.cartItem.count({ where: { cartId: fixture.customer.cartId } })).toBe(0);
  });

  it("rejects insufficient inventory", async () => {
    await prisma.storeInventory.update({
      where: { id: fixture.inventoryId },
      data: { stockQuantity: 1, availableStock: 1 },
    });
    await expect(createOrder(orderInput())).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await prisma.order.count({ where: { userId: fixture.customer.userId } })).toBe(0);
    expect((await prisma.storeInventory.findUniqueOrThrow({ where: { id: fixture.inventoryId } })).reservedQuantity).toBe(0);
  });

  it("rolls back both reservation and order writes after a transactional failure", async () => {
    const orderNumber = `VM-ROLLBACK-${fixture.suffix}`;
    await expect(prisma.$transaction(async (tx) => {
      await reserveInventory(tx, fixture.storeId, [{ productId: fixture.productId, quantity: 2 }]);
      await tx.order.create({
        data: {
          orderNumber,
          userId: fixture.customer.userId,
          storeId: fixture.storeId,
          addressId: fixture.customer.addressId,
          deliverySlotId: "TEST_SLOT",
          deliveryDate: new Date("2026-10-10T00:00:00.000Z"),
          scheduledDeliveryAt: new Date("2026-10-10T02:30:00.000Z"),
          subtotal: 200,
          grandTotal: 229,
        },
      });
      throw new Error("injected transactional failure");
    })).rejects.toThrow("injected transactional failure");

    expect(await prisma.order.findUnique({ where: { orderNumber } })).toBeNull();
    const inventory = await prisma.storeInventory.findUniqueOrThrow({ where: { id: fixture.inventoryId } });
    expect(inventory.reservedQuantity).toBe(0);
    expect(inventory.availableStock).toBe(inventory.stockQuantity);
  });

  it("returns the original order on an idempotent retry without reserving again", async () => {
    const key = `checkout-${uniqueSuffix()}`;
    const first = await createOrder(orderInput(fixture.customer, key));
    const retry = await createOrder(orderInput(fixture.customer, key));

    expect(retry.replayed).toBe(true);
    expect(retry.order.id).toBe(first.order.id);
    expect(await prisma.order.count({ where: { userId: fixture.customer.userId } })).toBe(1);
    expect((await prisma.storeInventory.findUniqueOrThrow({ where: { id: fixture.inventoryId } })).reservedQuantity).toBe(2);
  });

  it("rejects reuse of an idempotency key with a different address", async () => {
    const key = `checkout-${uniqueSuffix()}`;
    await createOrder(orderInput(fixture.customer, key));
    const alternateAddress = await prisma.address.create({
      data: {
        userId: fixture.customer.userId,
        line1: "2 Alternate Street",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560002",
      },
    });
    await expect(createOrder({
      ...orderInput(fixture.customer, key),
      addressId: alternateAddress.id,
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("handles concurrent retries with the same key once", async () => {
    const key = `checkout-${uniqueSuffix()}`;
    const results = await Promise.all([
      createOrder(orderInput(fixture.customer, key)),
      createOrder(orderInput(fixture.customer, key)),
    ]);

    expect(results[0].order.id).toBe(results[1].order.id);
    expect(await prisma.order.count({ where: { userId: fixture.customer.userId } })).toBe(1);
    expect((await prisma.storeInventory.findUniqueOrThrow({ where: { id: fixture.inventoryId } })).reservedQuantity).toBe(2);
  });

  it("does not oversell the last unit across concurrent customers", async () => {
    await prisma.storeInventory.update({
      where: { id: fixture.inventoryId },
      data: { stockQuantity: 1, availableStock: 1 },
    });
    await prisma.cartItem.updateMany({
      where: { cartId: fixture.customer.cartId },
      data: { quantity: 1 },
    });
    const otherCustomer = await createCustomer(uniqueSuffix(), fixture.storeId, fixture.productId, 1);
    const attempts = await Promise.allSettled([
      createOrder(orderInput(fixture.customer)),
      createOrder(orderInput(otherCustomer)),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.order.count({ where: { userId: { in: customerIds } } })).toBe(1);
    const inventory = await prisma.storeInventory.findUniqueOrThrow({ where: { id: fixture.inventoryId } });
    expect(inventory.reservedQuantity).toBe(1);
    expect(inventory.availableStock).toBe(0);
    expect(inventory.stockQuantity - inventory.reservedQuantity).toBe(inventory.availableStock);
  });

  it("cancels a pending order and releases its linked reservation once", async () => {
    const created = await createOrder(orderInput());
    const result = await cancelOrder(fixture.customer.userId, created.order.id, "Customer changed mind");

    expect(result.replayed).toBe(false);
    expect(result.order.status).toBe("CANCELLED");
    expect(result.order.cancellationReason).toBe("Customer changed mind");
    const inventory = await prisma.storeInventory.findUniqueOrThrow({ where: { id: fixture.inventoryId } });
    expect(inventory.reservedQuantity).toBe(0);
    expect(inventory.reservedStock).toBe(0);
    expect(inventory.availableStock).toBe(5);
    await expect(prisma.inventoryMovement.findMany({
      where: { referenceId: created.order.id, type: "RELEASE" },
    })).resolves.toHaveLength(1);
    await expect(prisma.auditLog.findFirst({
      where: { entityId: created.order.id, action: "ORDER_CANCELLED" },
    })).resolves.not.toBeNull();
  });

  it("returns an idempotent response for repeated cancellation", async () => {
    const created = await createOrder(orderInput());
    await cancelOrder(fixture.customer.userId, created.order.id);
    const retry = await cancelOrder(fixture.customer.userId, created.order.id);

    expect(retry.replayed).toBe(true);
    expect(retry.order.status).toBe("CANCELLED");
    expect(await prisma.inventoryMovement.count({
      where: { referenceId: created.order.id, type: "RELEASE" },
    })).toBe(1);
    expect((await prisma.storeInventory.findUniqueOrThrow({ where: { id: fixture.inventoryId } })).availableStock).toBe(5);
  });

  it("serializes concurrent cancellation requests without double release", async () => {
    const created = await createOrder(orderInput());
    const results = await Promise.all([
      cancelOrder(fixture.customer.userId, created.order.id),
      cancelOrder(fixture.customer.userId, created.order.id),
    ]);

    expect(results.every((result) => result.order.status === "CANCELLED")).toBe(true);
    expect(await prisma.inventoryMovement.count({
      where: { referenceId: created.order.id, type: "RELEASE" },
    })).toBe(1);
    const inventory = await prisma.storeInventory.findUniqueOrThrow({ where: { id: fixture.inventoryId } });
    expect(inventory.reservedQuantity).toBe(0);
    expect(inventory.availableStock).toBe(5);
  });

  it("rejects cancellation after preparation starts", async () => {
    const created = await createOrder(orderInput());
    await prisma.order.update({ where: { id: created.order.id }, data: { status: "PREPARING" } });

    await expect(cancelOrder(fixture.customer.userId, created.order.id))
      .rejects.toMatchObject({ code: "CANCEL_NOT_ALLOWED" });
    expect((await prisma.storeInventory.findUniqueOrThrow({ where: { id: fixture.inventoryId } })).reservedQuantity).toBe(2);
  });

  it("rejects cancellation when a legacy order has no attributable reservation", async () => {
    const created = await createOrder(orderInput());
    await prisma.inventoryMovement.deleteMany({
      where: { referenceId: created.order.id, type: "RESERVATION" },
    });

    await expect(cancelOrder(fixture.customer.userId, created.order.id))
      .rejects.toMatchObject({ code: "CANCELLATION_UNSAFE" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: created.order.id } })).status).toBe("PENDING");
    expect((await prisma.storeInventory.findUniqueOrThrow({ where: { id: fixture.inventoryId } })).reservedQuantity).toBe(2);
  });

  it("rejects unsupported captured-payment cancellation without releasing stock", async () => {
    const created = await createOrder(orderInput());
    await prisma.$transaction([
      prisma.order.update({ where: { id: created.order.id }, data: { paymentStatus: "CAPTURED" } }),
      prisma.payment.update({ where: { orderId: created.order.id }, data: { status: "CAPTURED" } }),
    ]);

    await expect(cancelOrder(fixture.customer.userId, created.order.id))
      .rejects.toMatchObject({ code: "CANCEL_PAYMENT_UNSUPPORTED" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: created.order.id } })).status).toBe("PENDING");
    expect((await prisma.storeInventory.findUniqueOrThrow({ where: { id: fixture.inventoryId } })).reservedQuantity).toBe(2);
  });

  it("rolls back cancellation when linked reservation quantity is inconsistent", async () => {
    const created = await createOrder(orderInput());
    await prisma.storeInventory.update({
      where: { id: fixture.inventoryId },
      data: { reservedQuantity: 0, reservedStock: 0, availableStock: 5 },
    });

    await expect(cancelOrder(fixture.customer.userId, created.order.id))
      .rejects.toMatchObject({ code: "INVENTORY_RESERVATION_MISMATCH" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: created.order.id } })).status).toBe("PENDING");
    expect(await prisma.inventoryMovement.count({
      where: { referenceId: created.order.id, type: "RELEASE" },
    })).toBe(0);
  });
});