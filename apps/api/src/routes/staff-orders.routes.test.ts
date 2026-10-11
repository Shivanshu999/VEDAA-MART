import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Auth } from "../lib/auth.js";
import { handleError } from "../middleware/error-handler.js";
import { createStaffOrderRoutes } from "./v1/staff-orders.js";

function createApp(role?: string) {
  const auth = {
    api: {
      getSession: async () => role
        ? { user: { id: "user-test", email: "staff-test@example.invalid", name: "Test", role } }
        : null,
    },
  } as unknown as Auth;
  const app = new Hono();
  app.onError((error, context) => handleError(error, context));
  app.route("/api/v1/staff/orders", createStaffOrderRoutes(auth));
  return app;
}

describe("staff order route authentication", () => {
  it("rejects unauthenticated list requests", async () => {
    const response = await createApp().request("/api/v1/staff/orders");
    expect(response.status).toBe(401);
  });

  it("denies customers from the staff order API", async () => {
    const response = await createApp("CUSTOMER").request("/api/v1/staff/orders");
    expect(response.status).toBe(403);
  });

  it("rejects arbitrary status values before processing", async () => {
    const response = await createApp("STORE_STAFF").request("/api/v1/staff/orders/order-1/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "PAID", expectedStatus: "PENDING" }),
    });
    expect(response.status).toBe(400);
  });
});