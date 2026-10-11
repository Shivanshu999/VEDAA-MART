import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Auth } from "./lib/auth.js";
import type { Env } from "./env.js";
import { createV1Routes } from "./routes/v1/index.js";
import { handleError } from "./middleware/error-handler.js";
import { handleRazorpayWebhook } from "./modules/payments/payment.service.js";

export function createApp(auth: Auth, env: Env) {
  const app = new Hono();

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  app.get("/health", (c) => c.json({ status: "ok", service: "vedaa-api" }));

  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.post("/api/v1/webhooks/razorpay", async (c) => {
    const rawBody = await c.req.text();
    const signature = c.req.header("x-razorpay-signature");
    await handleRazorpayWebhook(env, rawBody, signature);
    return c.json({ received: true });
  });

  app.route("/api/v1", createV1Routes(auth, env));

  app.onError((err, c) => handleError(err, c));

  return app;
}
