import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeTestDatabase } from "../../test-utils/test-database.js";

const enabled = initializeTestDatabase();
const modules = enabled
  ? await Promise.all([
      import("@vedaa/database"),
      import("./staff-order.service.js"),
      import("./order.service.js"),
    ])
  : undefined;
const prisma = modules?.[0].prisma as unknown as typeof import("@vedaa/database").prisma;
const listOrders = modules?.[1].listStaffOrders as unknown as typeof import("./staff-order.service.js").listStaffOrders;
const getOrder = modules?.[1].getStaffOrder as unknown as typeof import("./staff-order.service.js").getStaffOrder;
const transition = modules?.[1].transitionStaffOrder as unknown as typeof import("./staff-order.service.js").transitionStaffOrder;
const cancelOrder = modules?.[2].cancelOrder as unknown as typeof import("./order.service.js").cancelOrder;
const pgDescribe = enabled ? describe : describe.skip;

let ids: {
  store: string;
  otherStore: string;
  category: string;
  product: string;
  inventory: string;
  customer: string;
  staff: string;
  address: string;
  otherAddress: string;
  order: string;
  otherOrder: string;
};

const suffix = () => `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const user = () => ({
  id: ids.staff,
  email: "staff@example.invalid",
  name: "Store Staff",
  role: "STORE_STAFF",
});

pgDescribe("staff orders (PostgreSQL integration)", () => {
  beforeEach(async () => {
    const key = suffix();
    const customer = await prisma.user.create({ data: { email: `staff-customer-${key}@example.invalid` } });
    const staff = await prisma.user.create({ data: { email: `staff-user-${key}@example.invalid`, role: "STORE_STAFF" } });
    const [store, otherStore] = await Promise.all([
      prisma.store.create({ data: { name: `Staff Store ${key}`, slug: `staff-store-${key}`, addressLine: "1 Test Rd", city: "Bengaluru", state: "Karnataka", postalCode: "560001" } }),
      prisma.store.create({ data: { name: `Other Store ${key}`, slug: `other-store-${key}`, addressLine: "2 Test Rd", city: "Bengaluru", state: "Karnataka", postalCode: "560002" } }),
    ]);
    await prisma.storeStaff.create({ data: { storeId: store.id, userId: staff.id, role: "STORE_STAFF" } });
    const category = await prisma.category.create({ data: { name: `Staff Category ${key}`, slug: `staff-category-${key}` } });
    const product = await prisma.product.create({
      data: { name: "Snapshot Product", slug: `staff-product-${key}`, sku: `STAFF-${key}`, categoryId: category.id, mrp: 20, sellingPrice: 18 },
    });
    const inventory = await prisma.storeInventory.create({
      data: { storeId: store.id, productId: product.id, stockQuantity: 5, reservedQuantity: 1, reservedStock: 1, availableStock: 4 },
    });
    const [address, otherAddress] = await Promise.all([
      prisma.address.create({ data: { userId: customer.id, line1: "1 Customer Rd", city: "Bengaluru", state: "Karnataka", postalCode: "560001" } }),
      prisma.address.create({ data: { userId: customer.id, line1: "2 Customer Rd", city: "Bengaluru", state: "Karnataka", postalCode: "560002" } }),
    ]);
    const orderData = (storeId: string, addressId: string, number: string) => ({
      orderNumber: number,
      userId: customer.id,
      storeId,
      addressId,
      status: "PENDING" as const,
      paymentStatus: "PENDING" as const,
      deliverySlotId: "NOON_1200",
      deliveryDate: new Date("2026-10-11T00:00:00.000Z"),
      scheduledDeliveryAt: new Date("2026-10-11T06:30:00.000Z"),
      subtotal: 18,
      grandTotal: 47,
      items: { create: [{ productId: product.id, productName: "Snapshot Product", productSku: product.sku, quantity: 1, unitMrp: 20, unitSellingPrice: 18, lineTotal: 18 }] },
      payment: { create: { amount: 47, status: "PENDING" as const } },
      delivery: { create: { slotId: "NOON_1200", scheduledAt: new Date("2026-10-11T06:30:00.000Z") } },
    });
    const [order, otherOrder] = await Promise.all([
      prisma.order.create({ data: orderData(store.id, address.id, `VM-STAFF-${key}`) }),
      prisma.order.create({ data: orderData(otherStore.id, otherAddress.id, `VM-OTHER-${key}`) }),
    ]);
    await prisma.inventoryMovement.create({
      data: { inventoryId: inventory.id, storeId: store.id, productId: product.id, type: "RESERVATION", quantity: 1, reference: "order", referenceId: order.id },
    });
    ids = {
      store: store.id,
      otherStore: otherStore.id,
      category: category.id,
      product: product.id,
      inventory: inventory.id,
      customer: customer.id,
      staff: staff.id,
      address: address.id,
      otherAddress: otherAddress.id,
      order: order.id,
      otherOrder: otherOrder.id,
    };
  });

  afterEach(async () => {
    if (!ids) return;
    const orderIds = [ids.order, ids.otherOrder];
    await prisma.auditLog.deleteMany({ where: { entityId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { inventoryId: ids.inventory } });
    await prisma.storeStaff.deleteMany({ where: { userId: ids.staff } });
    await prisma.address.deleteMany({ where: { id: { in: [ids.address, ids.otherAddress] } } });
    await prisma.storeInventory.deleteMany({ where: { id: ids.inventory } });
    await prisma.product.deleteMany({ where: { id: ids.product } });
    await prisma.category.deleteMany({ where: { id: ids.category } });
    await prisma.store.deleteMany({ where: { id: { in: [ids.store, ids.otherStore] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.customer, ids.staff] } } });
    ids = undefined as unknown as typeof ids;
  });

  it("lists only orders from stores assigned to the staff member", async () => {
    const result = await listOrders({ user: user(), page: 1, limit: 20 });
    expect(result.data.map(({ id }) => id)).toContain(ids.order);
    expect(result.data.map(({ id }) => id)).not.toContain(ids.otherOrder);
    await expect(listOrders({ user: user(), storeId: ids.otherStore, page: 1, limit: 20 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("hides an order belonging to another store", async () => {
    await expect(getOrder({ user: user(), orderId: ids.otherOrder }))
      .rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });

  it("does not process pending payment orders", async () => {
    await expect(transition({ user: user(), orderId: ids.order, nextStatus: "CONFIRMED", expectedStatus: "PENDING" }))
      .rejects.toMatchObject({ code: "ORDER_PAYMENT_REQUIRED" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: ids.order } })).status).toBe("PENDING");
  });

  it("audits valid transitions and preserves payment and inventory", async () => {
    await prisma.$transaction([
      prisma.order.update({ where: { id: ids.order }, data: { paymentStatus: "CAPTURED" } }),
      prisma.payment.update({ where: { orderId: ids.order }, data: { status: "CAPTURED" } }),
    ]);
    const before = await prisma.storeInventory.findUniqueOrThrow({ where: { id: ids.inventory } });
    const result = await transition({ user: user(), orderId: ids.order, nextStatus: "CONFIRMED", expectedStatus: "PENDING" });
    expect(result.data.status).toBe("CONFIRMED");

    const order = await prisma.order.findUniqueOrThrow({ where: { id: ids.order }, include: { payment: true } });
    expect(order.paymentStatus).toBe("CAPTURED");
    expect(order.payment?.status).toBe("CAPTURED");
    const after = await prisma.storeInventory.findUniqueOrThrow({ where: { id: ids.inventory } });
    expect(after.reservedQuantity).toBe(before.reservedQuantity);
    expect(after.availableStock).toBe(before.availableStock);
    expect(after.availableStock).toBe(after.stockQuantity - after.reservedQuantity);
    expect(await prisma.auditLog.findFirst({ where: { entityId: ids.order, actorId: ids.staff, action: "ORDER_STATUS_CHANGED" } }))
      .toMatchObject({ metadata: { fromStatus: "PENDING", toStatus: "CONFIRMED", storeId: ids.store } });
  });

  it("allows only one concurrent transition from the same expected state", async () => {
    await prisma.$transaction([
      prisma.order.update({ where: { id: ids.order }, data: { paymentStatus: "CAPTURED" } }),
      prisma.payment.update({ where: { orderId: ids.order }, data: { status: "CAPTURED" } }),
    ]);
    const results = await Promise.allSettled([
      transition({ user: user(), orderId: ids.order, nextStatus: "CONFIRMED", expectedStatus: "PENDING" }),
      transition({ user: user(), orderId: ids.order, nextStatus: "CONFIRMED", expectedStatus: "PENDING" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: ids.order } })).status).toBe("CONFIRMED");
    expect(await prisma.auditLog.count({ where: { entityId: ids.order, action: "ORDER_STATUS_CHANGED" } })).toBe(1);
  });

  it("keeps cancellation racing with staff processing consistent", async () => {
    const results = await Promise.allSettled([
      cancelOrder(ids.customer, ids.order, "Customer cancellation"),
      transition({ user: user(), orderId: ids.order, nextStatus: "CONFIRMED", expectedStatus: "PENDING" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: ids.order } });
    const inventory = await prisma.storeInventory.findUniqueOrThrow({ where: { id: ids.inventory } });
    expect(order.status).toBe("CANCELLED");
    expect(order.paymentStatus).toBe("PENDING");
    expect(inventory.reservedQuantity).toBe(0);
    expect(inventory.availableStock).toBe(inventory.stockQuantity);
    expect(await prisma.inventoryMovement.count({ where: { referenceId: ids.order, type: "RELEASE" } })).toBe(1);
  });
});