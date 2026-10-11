import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeTestDatabase } from "../../test-utils/test-database.js";

const enabled = initializeTestDatabase();
const modules = enabled
  ? await Promise.all([
      import("@vedaa/database"),
      import("./payment.service.js"),
      import("../orders/order.service.js"),
    ])
  : undefined;
const prisma = modules?.[0].prisma as unknown as typeof import("@vedaa/database").prisma;
const createPaymentService = modules?.[1].createPaymentService as unknown as typeof import("./payment.service.js").createPaymentService;
const cancelOrder = modules?.[2].cancelOrder as unknown as typeof import("../orders/order.service.js").cancelOrder;
const pgDescribe = enabled ? describe : describe.skip;

const testSecret = "phase7-integration-secret";
let fixture: {
  suffix: string;
  userId: string;
  addressId: string;
  storeId: string;
  categoryId: string;
  productId: string;
  inventoryId: string;
  orderId: string;
};

function suffix() {
  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function createFakeGateway() {
  const byReceipt = new Map<string, any>();
  const ordersAll = vi.fn(async ({ receipt }: { receipt: string }) => ({
    items: [...byReceipt.values()].filter((order) => order.receipt === receipt),
  }));
  const ordersCreate = vi.fn(async (input: {
    amount: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  }) => {
    const order = {
      id: `order_gateway_${input.receipt.slice(0, 12)}`,
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      status: "created",
      notes: input.notes,
    };
    byReceipt.set(input.receipt, order);
    return order;
  });
  const paymentFetch = vi.fn(async (paymentId: string) => ({
    id: paymentId,
    order_id: "order_gateway_test",
    amount: 4700,
    currency: "INR",
    status: "captured",
    captured: true,
    method: "upi",
  }));
  return {
    gateway: {
      orders: { all: ordersAll, create: ordersCreate },
      payments: { fetch: paymentFetch },
    },
    byReceipt,
    ordersAll,
    ordersCreate,
    paymentFetch,
  };
}

function paymentService(gateway: ReturnType<typeof createFakeGateway>["gateway"]) {
  return createPaymentService({
    NODE_ENV: "test",
    PORT: 4000,
    DATABASE_URL: "unused-injected-gateway",
    BETTER_AUTH_SECRET: "test-only-auth-secret-that-is-long-enough",
    BETTER_AUTH_URL: "http://localhost:4000",
    WEB_ORIGIN: "http://localhost:3000",
    PAYMENT_MODE: "razorpay",
    RAZORPAY_KEY_ID: "rzp_test_public",
    RAZORPAY_KEY_SECRET: testSecret,
  }, gateway as never);
}

function initInput(idempotencyKey = `payment-${suffix()}`) {
  return { userId: fixture.userId, orderId: fixture.orderId, idempotencyKey };
}

function signature(providerOrderId: string, providerPaymentId: string) {
  return createHmac("sha256", testSecret)
    .update(`${providerOrderId}|${providerPaymentId}`)
    .digest("hex");
}

pgDescribe("Razorpay payment attempt persistence (PostgreSQL integration)", () => {
  beforeEach(async () => {
    const key = suffix();
    const user = await prisma.user.create({ data: { email: `payment-user-${key}@example.invalid` } });
    const store = await prisma.store.create({
      data: { name: `Payment Store ${key}`, slug: `payment-store-${key}`, addressLine: "1 Payment Rd", city: "Bengaluru", state: "Karnataka", postalCode: "560001" },
    });
    const category = await prisma.category.create({ data: { name: `Payment Category ${key}`, slug: `payment-category-${key}` } });
    const product = await prisma.product.create({
      data: { name: "Payment Test Product", slug: `payment-product-${key}`, sku: `PAY-${key}`, categoryId: category.id, mrp: 20, sellingPrice: 18 },
    });
    const inventory = await prisma.storeInventory.create({
      data: { storeId: store.id, productId: product.id, stockQuantity: 5, reservedQuantity: 1, reservedStock: 1, availableStock: 4 },
    });
    const address = await prisma.address.create({
      data: { userId: user.id, line1: "1 Payment Customer Rd", city: "Bengaluru", state: "Karnataka", postalCode: "560001" },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `VM-PAY-${key}`,
        userId: user.id,
        storeId: store.id,
        addressId: address.id,
        status: "PENDING",
        paymentStatus: "PENDING",
        deliverySlotId: "NOON_1200",
        deliveryDate: new Date("2026-10-11T00:00:00.000Z"),
        scheduledDeliveryAt: new Date("2026-10-11T06:30:00.000Z"),
        subtotal: 18,
        grandTotal: 47,
        items: { create: [{ productId: product.id, productName: "Payment Test Product", productSku: product.sku, quantity: 1, unitMrp: 20, unitSellingPrice: 18, lineTotal: 18 }] },
        payment: { create: { amount: 47, status: "PENDING" } },
        delivery: { create: { slotId: "NOON_1200", scheduledAt: new Date("2026-10-11T06:30:00.000Z") } },
      },
      include: { items: true, payment: true },
    });
    await prisma.inventoryMovement.create({
      data: { inventoryId: inventory.id, storeId: store.id, productId: product.id, type: "RESERVATION", quantity: 1, reference: "order", referenceId: order.id },
    });
    fixture = {
      suffix: key,
      userId: user.id,
      addressId: address.id,
      storeId: store.id,
      categoryId: category.id,
      productId: product.id,
      inventoryId: inventory.id,
      orderId: order.id,
    };
  });

  afterEach(async () => {
    if (!fixture) return;
    await prisma.auditLog.deleteMany({ where: { entityId: fixture.orderId } });
    await prisma.order.deleteMany({ where: { id: fixture.orderId } });
    await prisma.inventoryMovement.deleteMany({ where: { inventoryId: fixture.inventoryId } });
    await prisma.storeInventory.deleteMany({ where: { id: fixture.inventoryId } });
    await prisma.address.deleteMany({ where: { id: fixture.addressId } });
    await prisma.product.deleteMany({ where: { id: fixture.productId } });
    await prisma.category.deleteMany({ where: { id: fixture.categoryId } });
    await prisma.store.deleteMany({ where: { id: fixture.storeId } });
    await prisma.user.deleteMany({ where: { id: fixture.userId } });
    fixture = undefined as unknown as typeof fixture;
  });

  it("creates one server-priced gateway order and reuses it on an idempotent retry", async () => {
    const fake = createFakeGateway();
    const service = paymentService(fake.gateway);
    const key = `same-${suffix()}`;
    const first = await service.createPaymentOrder(initInput(key));
    const retry = await service.createPaymentOrder(initInput(key));

    expect(first).toMatchObject({ amount: 4700, currency: "INR", keyId: "rzp_test_public" });
    expect(retry.attemptId).toBe(first.attemptId);
    expect(retry.providerOrderId).toBe(first.providerOrderId);
    expect(fake.ordersCreate).toHaveBeenCalledTimes(1);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: fixture.orderId } });
    expect(await prisma.paymentAttempt.count({ where: { paymentId: payment.id } })).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).paymentStatus).toBe("PENDING");
  });

  it("handles concurrent initialization retries with the same key as one attempt", async () => {
    const fake = createFakeGateway();
    const originalCreate = fake.ordersCreate.getMockImplementation()!;
    fake.ordersCreate.mockImplementation(async (input) => {
      const previous = fake.byReceipt.get(input.receipt);
      if (previous) return previous;
      return originalCreate(input);
    });
    const service = paymentService(fake.gateway);
    const key = `concurrent-${suffix()}`;
    const results = await Promise.all([
      service.createPaymentOrder(initInput(key)),
      service.createPaymentOrder(initInput(key)),
    ]);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: fixture.orderId } });

    expect(results[0].attemptId).toBe(results[1].attemptId);
    expect(results[0].providerOrderId).toBe(results[1].providerOrderId);
    expect(await prisma.paymentAttempt.count({ where: { paymentId: payment.id } })).toBe(1);
    expect(fake.byReceipt.size).toBe(1);
  });

  it("recovers a gateway order created before a simulated response timeout", async () => {
    const fake = createFakeGateway();
    const realCreate = fake.ordersCreate.getMockImplementation()!;
    fake.ordersCreate.mockImplementationOnce(async (input) => {
      await realCreate(input);
      throw new Error("simulated network timeout after provider create");
    });
    const result = await paymentService(fake.gateway).createPaymentOrder(initInput());
    expect(result.providerOrderId).toMatch(/^order_gateway_/);
    expect(fake.ordersCreate).toHaveBeenCalledTimes(1);
    expect(fake.ordersAll).toHaveBeenCalledTimes(2);
  });

  it("verifies a captured gateway payment and commits payment, order, and stock together", async () => {
    const fake = createFakeGateway();
    const service = paymentService(fake.gateway);
    const initialized = await service.createPaymentOrder(initInput());
    fake.paymentFetch.mockImplementation(async (paymentId) => ({
      id: paymentId,
      order_id: initialized.providerOrderId,
      amount: initialized.amount,
      currency: initialized.currency,
      status: "captured",
      captured: true,
      method: "upi",
    }));
    const providerPaymentId = `pay_${suffix()}`;
    const result = await service.verifyPayment({
      userId: fixture.userId,
      orderId: fixture.orderId,
      attemptId: initialized.attemptId,
      providerOrderId: initialized.providerOrderId,
      providerPaymentId,
      signature: signature(initialized.providerOrderId, providerPaymentId),
    });
    const retry = await service.verifyPayment({
      userId: fixture.userId,
      orderId: fixture.orderId,
      attemptId: initialized.attemptId,
      providerOrderId: initialized.providerOrderId,
      providerPaymentId,
      signature: signature(initialized.providerOrderId, providerPaymentId),
    });

    expect(result).toMatchObject({ verified: true, reconciliationRequired: false, orderStatus: "CONFIRMED", paymentStatus: "CAPTURED" });
    expect(retry).toMatchObject({ replayed: true, reconciliationRequired: false });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId }, include: { payment: true } });
    expect(order.paymentStatus).toBe("CAPTURED");
    expect(order.payment?.status).toBe("CAPTURED");
    expect(order.payment?.providerPaymentId).toBe(providerPaymentId);
    const inventory = await prisma.storeInventory.findUniqueOrThrow({ where: { id: fixture.inventoryId } });
    expect(inventory.stockQuantity).toBe(4);
    expect(inventory.reservedQuantity).toBe(0);
    expect(inventory.availableStock).toBe(4);
    expect(inventory.availableStock).toBe(inventory.stockQuantity - inventory.reservedQuantity);
    expect(await prisma.inventoryMovement.count({ where: { referenceId: fixture.orderId, type: "SALE" } })).toBe(1);
  });

  it("does not capture payment when the gateway amount or association mismatches", async () => {
    const fake = createFakeGateway();
    const service = paymentService(fake.gateway);
    const initialized = await service.createPaymentOrder(initInput());
    fake.paymentFetch.mockImplementationOnce(async (paymentId) => ({
      id: paymentId,
      order_id: "order_wrong",
      amount: initialized.amount + 100,
      currency: initialized.currency,
      status: "captured",
      captured: true,
      method: "card",
    }));
    const providerPaymentId = `pay_${suffix()}`;

    await expect(service.verifyPayment({
      userId: fixture.userId,
      orderId: fixture.orderId,
      attemptId: initialized.attemptId,
      providerOrderId: initialized.providerOrderId,
      providerPaymentId,
      signature: signature(initialized.providerOrderId, providerPaymentId),
    })).rejects.toMatchObject({ code: "PAYMENT_MISMATCH" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).status).toBe("PENDING");
    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId: fixture.orderId } })).status).toBe("PENDING");
  });

  it("records a server-verified failure and permits a distinct subsequent attempt", async () => {
    const fake = createFakeGateway();
    const service = paymentService(fake.gateway);
    const first = await service.createPaymentOrder(initInput());
    const failedPaymentId = `pay_failed_${suffix()}`;
    fake.paymentFetch.mockImplementationOnce(async () => ({
      id: failedPaymentId,
      order_id: first.providerOrderId,
      amount: first.amount,
      currency: first.currency,
      status: "failed",
      captured: false,
      method: "upi",
    }));
    const failed = await service.markPaymentFailed({
      userId: fixture.userId,
      orderId: fixture.orderId,
      attemptId: first.attemptId,
      providerOrderId: first.providerOrderId,
      providerPaymentId: failedPaymentId,
    });
    expect(failed.failed).toBe(true);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).paymentStatus).toBe("FAILED");

    const second = await service.createPaymentOrder(initInput(`retry-${suffix()}`));
    expect(second.attemptId).not.toBe(first.attemptId);
    expect(fake.ordersCreate).toHaveBeenCalledTimes(2);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: fixture.orderId } });
    expect(await prisma.paymentAttempt.count({ where: { paymentId: payment.id } })).toBe(2);
  });

  it("records late captured payment after cancellation without reopening or reserving stock", async () => {
    const fake = createFakeGateway();
    const service = paymentService(fake.gateway);
    const initialized = await service.createPaymentOrder(initInput());
    await cancelOrder(fixture.userId, fixture.orderId);
    const providerPaymentId = `pay_late_${suffix()}`;
    fake.paymentFetch.mockImplementationOnce(async () => ({
      id: providerPaymentId,
      order_id: initialized.providerOrderId,
      amount: initialized.amount,
      currency: initialized.currency,
      status: "captured",
      captured: true,
      method: "card",
    }));
    const result = await service.verifyPayment({
      userId: fixture.userId,
      orderId: fixture.orderId,
      attemptId: initialized.attemptId,
      providerOrderId: initialized.providerOrderId,
      providerPaymentId,
      signature: signature(initialized.providerOrderId, providerPaymentId),
    });

    expect(result).toMatchObject({ reconciliationRequired: true, orderStatus: "CANCELLED", paymentStatus: "CAPTURED" });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId }, include: { payment: true } });
    expect(order.status).toBe("CANCELLED");
    expect(order.paymentStatus).toBe("CAPTURED");
    expect(order.payment?.status).toBe("CAPTURED");
    const inventory = await prisma.storeInventory.findUniqueOrThrow({ where: { id: fixture.inventoryId } });
    expect(inventory.stockQuantity).toBe(5);
    expect(inventory.reservedQuantity).toBe(0);
    expect(inventory.availableStock).toBe(5);
    expect(await prisma.auditLog.findFirst({ where: { entityId: fixture.orderId, action: "PAYMENT_CAPTURED_AFTER_CANCELLATION" } })).not.toBeNull();
  });

  it("records an authoritative capture for reconciliation when reservation finalization fails", async () => {
    const fake = createFakeGateway();
    const service = paymentService(fake.gateway);
    const initialized = await service.createPaymentOrder(initInput());
    await prisma.storeInventory.update({
      where: { id: fixture.inventoryId },
      data: { reservedQuantity: 0, reservedStock: 0, availableStock: 5 },
    });
    const providerPaymentId = `pay_inventory_mismatch_${suffix()}`;
    fake.paymentFetch.mockImplementationOnce(async () => ({
      id: providerPaymentId,
      order_id: initialized.providerOrderId,
      amount: initialized.amount,
      currency: initialized.currency,
      status: "captured",
      captured: true,
      method: "card",
    }));

    const result = await service.verifyPayment({
      userId: fixture.userId,
      orderId: fixture.orderId,
      attemptId: initialized.attemptId,
      providerOrderId: initialized.providerOrderId,
      providerPaymentId,
      signature: signature(initialized.providerOrderId, providerPaymentId),
    });

    expect(result).toMatchObject({ reconciliationRequired: true, orderStatus: "PENDING", paymentStatus: "CAPTURED" });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId }, include: { payment: true } });
    expect(order.status).toBe("PENDING");
    expect(order.paymentStatus).toBe("CAPTURED");
    expect(order.payment?.status).toBe("CAPTURED");
    expect((await prisma.storeInventory.findUniqueOrThrow({ where: { id: fixture.inventoryId } })).stockQuantity).toBe(5);
    expect(await prisma.inventoryMovement.count({ where: { referenceId: fixture.orderId, type: "SALE" } })).toBe(0);
    expect(await prisma.auditLog.findFirst({ where: { entityId: fixture.orderId, action: "PAYMENT_CAPTURE_INVENTORY_RECONCILIATION" } })).not.toBeNull();
  });
});
