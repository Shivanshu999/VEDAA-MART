import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "@vedaa/database";
import type { Auth } from "../../lib/auth.js";
import { attachSession, requireAuth, requireRole } from "../../middleware/session.js";
import {
  cancelOrder,
  createOrder,
  getCustomerOrderDetail,
  previewOrder,
} from "../../modules/orders/order.service.js";
import { AppError } from "@vedaa/shared";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function createOrdersRoutes(auth: Auth) {
  const app = new Hono();
  app.use("*", async (c, next) => attachSession(auth, c, next));

  app.get("/", zValidator("query", paginationSchema), async (c) => {
    const user = requireRole(c, ["CUSTOMER"]);
    const { page, limit } = c.req.valid("query");
    const where = { userId: user.id };
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          status: true,
          paymentStatus: true,
          currency: true,
          grandTotal: true,
          deliverySlotId: true,
          deliveryDate: true,
          scheduledDeliveryAt: true,
          deliveryWindowLabel: true,
        },
      }),
      prisma.order.count({ where }),
    ]);
    return c.json({
      data: orders.map((order) => ({
        ...order,
        deliveryDate: order.deliveryDate.toISOString().slice(0, 10),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  app.get("/:id", async (c) => {
    const user = requireRole(c, ["CUSTOMER"]);
    const id = c.req.param("id");
    const order = await getCustomerOrderDetail(user.id, id);
    return c.json({ data: order });
  });

  app.post(
    "/preview",
    zValidator(
      "json",
      z.object({
        addressId: z.string().min(1),
        couponCode: z.string().trim().min(1).max(64).optional(),
      }).strict(),
    ),
    async (c) => {
      const user = requireAuth(c);
      if (user.role !== "CUSTOMER") {
        throw new AppError("Customer account required", "FORBIDDEN", 403);
      }
      const body = c.req.valid("json");
      const preview = await previewOrder({ userId: user.id, ...body });
      return c.json({ data: preview });
    },
  );

  app.post(
    "/",
    zValidator(
      "json",
      z.object({
        addressId: z.string().min(1),
        couponCode: z.string().trim().min(1).max(64).optional(),
        idempotencyKey: z.string().min(8).max(128),
      }).strict(),
    ),
    async (c) => {
      const user = requireAuth(c);
      const body = c.req.valid("json");
      if (user.role !== "CUSTOMER") {
        throw new AppError("Customer account required", "FORBIDDEN", 403);
      }
      const result = await createOrder({
        userId: user.id,
        addressId: body.addressId,
        couponCode: body.couponCode,
        idempotencyKey: body.idempotencyKey,
      });
      return c.json(
        { data: result.order, delivery: result.delivery },
        result.replayed ? 200 : 201,
      );
    },
  );

  app.post("/:id/cancel", async (c) => {
    const user = requireRole(c, ["CUSTOMER"]);
    const id = c.req.param("id");
    const body = z.object({ reason: z.string().trim().max(500).optional() }).strict()
      .parse(await c.req.json().catch(() => ({})));
    const result = await cancelOrder(user.id, id, body.reason);
    return c.json({ data: result.order, replayed: result.replayed });
  });

  return app;
}
