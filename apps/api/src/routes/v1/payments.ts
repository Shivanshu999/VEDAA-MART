import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Auth } from "../../lib/auth.js";
import { attachSession, requireRole } from "../../middleware/session.js";
import type { PaymentAdapter } from "../../modules/payments/payment.service.js";

export function createPaymentsRoutes(auth: Auth, paymentService: PaymentAdapter) {
  const app = new Hono();
  app.use("*", async (c, next) => attachSession(auth, c, next));

  app.post("/create-order", zValidator("json", z.object({
    orderId: z.string().min(1),
    idempotencyKey: z.string().min(8).max(128),
  }).strict()), async (c) => {
    const user = requireRole(c, ["CUSTOMER"]);
    const paymentOrder = await paymentService.createPaymentOrder({ userId: user.id, ...c.req.valid("json") });
    return c.json({ data: paymentOrder });
  });

  app.post(
    "/verify",
    zValidator(
      "json",
      z.object({
        orderId: z.string().min(1),
        attemptId: z.string().min(1),
        providerOrderId: z.string().min(1),
        providerPaymentId: z.string().min(1),
        signature: z.string().regex(/^[a-fA-F0-9]{64}$/),
      }).strict(),
    ),
    async (c) => {
      const user = requireRole(c, ["CUSTOMER"]);
      const body = c.req.valid("json");
      const result = await paymentService.verifyPayment({ userId: user.id, ...body });
      return c.json({ data: result }, result.reconciliationRequired ? 202 : 200);
    },
  );

  app.post(
    "/failed",
    zValidator("json", z.object({
      orderId: z.string().min(1),
      attemptId: z.string().min(1),
      providerOrderId: z.string().min(1),
      providerPaymentId: z.string().min(1),
    }).strict()),
    async (c) => {
      const user = requireRole(c, ["CUSTOMER"]);
      const result = await paymentService.markPaymentFailed({ userId: user.id, ...c.req.valid("json") });
      return c.json({ data: result });
    },
  );

  return app;
}
