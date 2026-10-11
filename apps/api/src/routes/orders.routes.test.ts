import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Auth } from "../lib/auth.js";
import { handleError } from "../middleware/error-handler.js";
import { createOrdersRoutes } from "./v1/orders.js";

describe("POST /api/v1/orders authentication", () => {
  it("rejects an unauthenticated checkout request", async () => {
    const auth = {
      api: { getSession: async () => null },
    } as unknown as Auth;
    const app = new Hono();
    app.onError((error, context) => handleError(error, context));
    app.route("/api/v1/orders", createOrdersRoutes(auth));

    const response = await app.request("/api/v1/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        addressId: "address_fake",
        idempotencyKey: "checkout-key-123",
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("rejects unauthenticated order-history requests", async () => {
    const auth = {
      api: { getSession: async () => null },
    } as unknown as Auth;
    const app = new Hono();
    app.onError((error, context) => handleError(error, context));
    app.route("/api/v1/orders", createOrdersRoutes(auth));

    const response = await app.request("/api/v1/orders?page=1&limit=10");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });
});