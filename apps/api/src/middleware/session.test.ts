import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { handleError } from "./error-handler.js";
import { requireAnyRole, requireAuth, requireRole, requireStoreAccess } from "./session.js";

function createAppWithUser(role: string) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    (c as any).set("user", {
      id: "user-1",
      email: "user@example.com",
      name: "Demo User",
      role,
    });
    await next();
  });
  app.onError((err, c) => handleError(err, c));
  return app;
}

describe("session authorization middleware", () => {
  it("rejects unauthenticated requests", async () => {
    const app = new Hono();
    app.get("/private", (c) => {
      requireAuth(c);
      return c.json({ ok: true });
    });
    app.onError((err, c) => handleError(err, c));

    const res = await app.request("http://localhost/private");
    expect(res.status).toBe(401);
  });

  it("allows matching roles", async () => {
    const app = createAppWithUser("ADMIN");
    app.get("/admin-only", (c) => {
      requireRole(c, ["ADMIN"]);
      return c.json({ ok: true });
    });

    const res = await app.request("http://localhost/admin-only");
    expect(res.status).toBe(200);
  });

  it("denies mismatched roles", async () => {
    const app = createAppWithUser("CUSTOMER");
    app.get("/admin-only", (c) => {
      requireRole(c, ["ADMIN"]);
      return c.json({ ok: true });
    });

    const res = await app.request("http://localhost/admin-only");
    expect(res.status).toBe(403);
  });

  it("allows any of the configured roles", async () => {
    const app = createAppWithUser("STORE_STAFF");
    app.get("/staff", (c) => {
      requireAnyRole(c, ["ADMIN", "STORE_STAFF"]);
      return c.json({ ok: true });
    });

    const res = await app.request("http://localhost/staff");
    expect(res.status).toBe(200);
  });

  it("allows admin to access a store resource without an explicit store membership", async () => {
    const app = createAppWithUser("ADMIN");
    app.get("/store", (c) => {
      requireStoreAccess(c, "store-123");
      return c.json({ ok: true });
    });

    const res = await app.request("http://localhost/store");
    expect(res.status).toBe(200);
  });

  it("blocks non-admin users from store access", async () => {
    const app = createAppWithUser("CUSTOMER");
    app.get("/store", (c) => {
      requireStoreAccess(c, "store-123");
      return c.json({ ok: true });
    });

    const res = await app.request("http://localhost/store");
    expect(res.status).toBe(403);
  });

  it("allows staff only for an explicitly authorized store", async () => {
    const app = createAppWithUser("STORE_STAFF");
    app.get("/store", (c) => {
      requireStoreAccess(c, "store-123", ["store-123"]);
      return c.json({ ok: true });
    });

    const res = await app.request("http://localhost/store");
    expect(res.status).toBe(200);
  });

  it("denies staff without matching store membership", async () => {
    const app = createAppWithUser("STORE_STAFF");
    app.get("/store", (c) => {
      requireStoreAccess(c, "store-123", ["store-456"]);
      return c.json({ ok: true });
    });

    const res = await app.request("http://localhost/store");
    expect(res.status).toBe(403);
  });
});
