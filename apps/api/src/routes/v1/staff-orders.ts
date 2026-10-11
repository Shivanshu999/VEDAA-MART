import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { OrderStatus } from "@vedaa/database";
import { z } from "zod";
import type { Auth } from "../../lib/auth.js";
import { attachSession, requireRole } from "../../middleware/session.js";
import { getStaffOrder, listStaffOrders, transitionStaffOrder } from "../../modules/orders/staff-order.service.js";

const staffRoles = ["ADMIN", "STORE_MANAGER", "STORE_STAFF"];
const storeFilter = { storeId: z.string().min(1).optional() };
const listSchema = z.object({
  ...storeFilter,
  status: z.nativeEnum(OrderStatus).optional(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export function createStaffOrderRoutes(auth: Auth) {
  const app = new Hono();
  app.use("*", async (c, next) => attachSession(auth, c, next));

  app.get("/", zValidator("query", listSchema), async (c) => {
    const user = requireRole(c, staffRoles);
    const result = await listStaffOrders({ user, ...c.req.valid("query") });
    return c.json(result);
  });

  app.get(
    "/:id",
    zValidator("query", z.object(storeFilter).strict()),
    async (c) => {
      const user = requireRole(c, staffRoles);
      const result = await getStaffOrder({
        user,
        orderId: c.req.param("id"),
        ...c.req.valid("query"),
      });
      return c.json({ data: result });
    },
  );

  app.patch(
    "/:id/status",
    zValidator(
      "json",
      z.object({
        status: z.nativeEnum(OrderStatus),
        expectedStatus: z.nativeEnum(OrderStatus),
        ...storeFilter,
      }).strict(),
    ),
    async (c) => {
      const user = requireRole(c, staffRoles);
      const body = c.req.valid("json");
      const result = await transitionStaffOrder({
        user,
        orderId: c.req.param("id"),
        nextStatus: body.status,
        expectedStatus: body.expectedStatus,
        storeId: body.storeId,
      });
      return c.json(result);
    },
  );

  return app;
}