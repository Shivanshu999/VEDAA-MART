import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Auth } from "../lib/auth.js";
import { handleError } from "../middleware/error-handler.js";
import { initializeTestDatabase } from "../test-utils/test-database.js";

const testDatabaseEnabled = initializeTestDatabase();
const modules = testDatabaseEnabled
  ? await Promise.all([import("@vedaa/database"), import("./v1/orders.js")])
  : undefined;
const prisma = modules?.[0].prisma as unknown as typeof import("@vedaa/database").prisma;
const createOrdersRoutes = modules?.[1].createOrdersRoutes as unknown as typeof import("./v1/orders.js").createOrdersRoutes;
const databaseDescribe = testDatabaseEnabled ? describe : describe.skip;

let suffix: string;
let customerId: string;
let otherCustomerId: string;
let customerAddressId: string;
let otherAddressId: string;
let storeId: string;
let categoryId: string;
let productId: string;
let orderIds: string[];

function appFor(userId: string) {
  const auth = {
    api: {
      getSession: async () => ({
        user: { id: userId, email: `${userId}@example.invalid`, name: "Order Route Test", role: "CUSTOMER" },
      }),
    },
  } as unknown as Auth;
  const app = new Hono();
  app.onError((error, context) => handleError(error, context));
  app.route("/api/v1/orders", createOrdersRoutes(auth));
  return app;
}

async function createFixtureOrder(userId: string, addressId: string, orderIndex: number, createdAt: Date) {
  const deliveryAt = new Date("2026-10-11T06:30:00.000Z");
  const order = await prisma.order.create({
    data: {
      orderNumber: `VM-ROUTE-${suffix}-${orderIndex}`,
      userId,
      storeId,
      addressId,
      status: "PENDING",
      paymentStatus: "PENDING",
      orderedAt: createdAt,
      createdAt,
      deliverySlotId: "AFTERNOON_1500",
      deliveryDate: new Date("2026-10-11T00:00:00.000Z"),
      scheduledDeliveryAt: deliveryAt,
      deliveryWindowLabel: "Scheduled delivery by 3:00 PM.",
      addressSnapshot: {
        recipientName: "Snapshot Customer",
        label: "Home",
        line1: "10 Saved Street",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560010",
        country: "IN",
      },
      subtotal: 20,
      grandTotal: 49,
      items: {
        create: [{
          productId,
          productName: "Saved Product Name",
          productSku: "SAVED-SKU",
          brand: "Snapshot Brand",
          packageSize: "2 kg",
          quantity: 2,
          unitMrp: 12,
          unitSellingPrice: 10,
          lineTotal: 20,
        }],
      },
      payment: { create: { amount: 49, status: "PENDING" } },
      delivery: { create: { slotId: "AFTERNOON_1500", scheduledAt: deliveryAt } },
    },
  });
  orderIds.push(order.id);
  return order;
}

databaseDescribe("customer order routes (PostgreSQL integration)", () => {
  beforeEach(async () => {
    suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    orderIds = [];
    const [customer, otherCustomer] = await Promise.all([
      prisma.user.create({ data: { email: `history-${suffix}@example.invalid`, name: "History Customer" } }),
      prisma.user.create({ data: { email: `other-history-${suffix}@example.invalid`, name: "Other Customer" } }),
    ]);
    customerId = customer.id;
    otherCustomerId = otherCustomer.id;
    const [customerAddress, otherAddress] = await Promise.all([
      prisma.address.create({ data: { userId: customerId, line1: "10 Saved Street", city: "Bengaluru", state: "Karnataka", postalCode: "560010" } }),
      prisma.address.create({ data: { userId: otherCustomerId, line1: "20 Other Street", city: "Bengaluru", state: "Karnataka", postalCode: "560020" } }),
    ]);
    customerAddressId = customerAddress.id;
    otherAddressId = otherAddress.id;
    const store = await prisma.store.create({
      data: {
        name: `History Store ${suffix}`,
        slug: `history-store-${suffix}`,
        addressLine: "1 Test Road",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
      },
    });
    storeId = store.id;
    const category = await prisma.category.create({
      data: { name: `History Category ${suffix}`, slug: `history-category-${suffix}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        name: "Current Product Name",
        slug: `history-product-${suffix}`,
        sku: `HISTORY-${suffix}`,
        categoryId,
        mrp: 99,
        sellingPrice: 89,
      },
    });
    productId = product.id;

    await createFixtureOrder(customerId, customerAddressId, 1, new Date("2026-10-08T10:00:00.000Z"));
    await createFixtureOrder(customerId, customerAddressId, 2, new Date("2026-10-09T10:00:00.000Z"));
    await createFixtureOrder(customerId, customerAddressId, 3, new Date("2026-10-09T10:00:00.000Z"));
    await createFixtureOrder(otherCustomerId, otherAddressId, 4, new Date("2026-10-10T10:00:00.000Z"));
  });

  afterEach(async () => {
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.address.deleteMany({ where: { id: { in: [customerAddressId, otherAddressId] } } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, otherCustomerId] } } });
  });

  it("limits history to the customer and paginates deterministically", async () => {
    const expected = await prisma.order.findMany({
      where: { userId: customerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    const app = appFor(customerId);
    const firstResponse = await app.request("/api/v1/orders?page=1&limit=2");
    const firstPage = await firstResponse.json() as {
      data: { id: string }[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };
    const secondResponse = await app.request("/api/v1/orders?page=2&limit=2");
    const secondPage = await secondResponse.json() as { data: { id: string }[] };

    expect(firstResponse.status).toBe(200);
    expect(firstPage.data.map((order) => order.id)).toEqual(expected.slice(0, 2).map((order) => order.id));
    expect(secondPage.data.map((order) => order.id)).toEqual(expected.slice(2).map((order) => order.id));
    expect(firstPage.pagination).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect([...firstPage.data, ...secondPage.data].some((order) => order.id === orderIds[3])).toBe(false);
  });

  it("hides another customer's order and returns immutable detail snapshots", async () => {
    const targetOrder = await prisma.order.findFirstOrThrow({ where: { userId: customerId } });
    await prisma.product.update({ where: { id: productId }, data: { name: "Renamed Product", sellingPrice: 1 } });
    const forbiddenResponse = await appFor(otherCustomerId).request(`/api/v1/orders/${targetOrder.id}`);
    const ownResponse = await appFor(customerId).request(`/api/v1/orders/${targetOrder.id}`);
    const detail = await ownResponse.json() as { data: Record<string, any> };

    expect(forbiddenResponse.status).toBe(404);
    expect(ownResponse.status).toBe(200);
    expect(detail.data.items[0]).toMatchObject({
      productName: "Saved Product Name",
      productSku: "SAVED-SKU",
      quantity: 2,
    });
    expect(Number(detail.data.items[0].unitSellingPrice)).toBe(10);
    expect(Number(detail.data.items[0].lineTotal)).toBe(20);
    expect(detail.data.address).toMatchObject({ line1: "10 Saved Street", postalCode: "560010" });
    expect(detail.data.addressSnapshotAvailable).toBe(true);
    expect(detail.data.paymentStatus).toBe("PENDING");
    expect(detail.data.payment.status).toBe("PENDING");
    expect(detail.data.delivery).toMatchObject({ slotId: "AFTERNOON_1500", deliveryDate: "2026-10-11" });
    expect(detail.data.payment).not.toHaveProperty("providerOrderId");
    expect(detail.data.payment).not.toHaveProperty("providerPaymentId");
  });
});