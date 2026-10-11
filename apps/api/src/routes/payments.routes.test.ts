import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { Auth } from "../lib/auth.js";
import type { PaymentAdapter } from "../modules/payments/payment.service.js";
import { handleError } from "../middleware/error-handler.js";
import { createPaymentsRoutes } from "./v1/payments.js";

function createApp(userId?: string) {
  const auth = {
    api: {
      getSession: async () => userId
        ? { user: { id: userId, email: `${userId}@example.invalid`, name: "Payment User", role: "CUSTOMER" } }
        : null,
    },
  } as unknown as Auth;
  const paymentService = {
    createPaymentOrder: vi.fn(async (input) => ({
      attemptId: "attempt_fake",
      providerOrderId: "gateway_order_fake",
      amount: 12345,
      currency: "INR",
      keyId: "rzp_test_public_key",
      owner: input.userId,
    })),
    verifyPayment: vi.fn(async () => ({
      verified: true as const,
      replayed: false,
      reconciliationRequired: false,
      orderStatus: "CONFIRMED" as const,
      paymentStatus: "CAPTURED" as const,
    })),
    markPaymentFailed: vi.fn(async () => ({ failed: true, replayed: false })),
  } as unknown as PaymentAdapter;
  const app = new Hono();
  app.onError((error, context) => handleError(error, context));
  app.route("/api/v1/payments", createPaymentsRoutes(auth, paymentService));
  return { app, paymentService };
}

const jsonHeaders = { "content-type": "application/json" };

describe("payment routes", () => {
  it("rejects unauthenticated payment initialization", async () => {
    const { app } = createApp();
    const response = await app.request("/api/v1/payments/create-order", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ orderId: "order_test", idempotencyKey: "payment-key-0001" }),
    });
    expect(response.status).toBe(401);
  });

  it("requires a payment idempotency key", async () => {
    const { app } = createApp("user_test");
    const response = await app.request("/api/v1/payments/create-order", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ orderId: "order_test" }),
    });
    expect(response.status).toBe(400);
  });

  it("passes the authenticated owner and request key to initialization", async () => {
    const { app, paymentService } = createApp("user_test");
    const response = await app.request("/api/v1/payments/create-order", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ orderId: "order_test", idempotencyKey: "payment-key-0001" }),
    });
    expect(response.status).toBe(200);
    expect(paymentService.createPaymentOrder).toHaveBeenCalledWith({
      userId: "user_test",
      orderId: "order_test",
      idempotencyKey: "payment-key-0001",
    });
  });

  it("requires a server-verifiable signature payload", async () => {
    const { app } = createApp("user_test");
    const response = await app.request("/api/v1/payments/verify", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        orderId: "order_test",
        attemptId: "attempt_test",
        providerOrderId: "gateway_order_test",
        providerPaymentId: "pay_test",
      }),
    });
    expect(response.status).toBe(400);
  });
});
