import { describe, expect, it } from "vitest";
import type { Env } from "../../env.js";
import { createPaymentService } from "./payment.service.js";

const developmentEnv = {
  NODE_ENV: "development",
  PAYMENT_MODE: "development",
} as Env;

describe("payment service configuration", () => {
  it("does not simulate a successful payment in development mode", async () => {
    const service = createPaymentService(developmentEnv);
    await expect(service.createPaymentOrder({
      userId: "user_test",
      orderId: "order_test",
      idempotencyKey: "payment-key-0001",
    })).rejects.toMatchObject({ code: "PAYMENT_CONFIG" });
    await expect(service.verifyPayment({
      userId: "user_test",
      orderId: "order_test",
      attemptId: "attempt_test",
      providerOrderId: "order_gateway_test",
      providerPaymentId: "pay_test",
      signature: "0".repeat(64),
    })).rejects.toMatchObject({ code: "PAYMENT_CONFIG" });
  });

  it("fails closed when Razorpay is selected without credentials", async () => {
    const env = { ...developmentEnv, PAYMENT_MODE: "razorpay" } as Env;
    const service = createPaymentService(env);
    await expect(service.createPaymentOrder({
      userId: "user_test",
      orderId: "order_test",
      idempotencyKey: "payment-key-0001",
    })).rejects.toMatchObject({ code: "PAYMENT_CONFIG" });
  });
});
