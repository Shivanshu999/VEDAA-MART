import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma, OrderStatus } from "@vedaa/database";
import type { Auth } from "../../lib/auth.js";
import { attachSession, requireRole } from "../../middleware/session.js";
import { DELIVERY_SLOTS } from "../../modules/delivery/delivery-schedule.types.js";
import { AppError } from "@vedaa/shared";
import { transitionStaffOrder } from "../../modules/orders/staff-order.service.js";

const adminRoles = ["ADMIN", "STORE_MANAGER", "STORE_STAFF"];

export function createAdminRoutes(auth: Auth) {
  const app = new Hono();
  app.use("*", async (c, next) => attachSession(auth, c, next));

  app.get("/dashboard", async (c) => {
    requireRole(c, adminRoles);
    const [ordersToday, lowStock, products] = await Promise.all([
      prisma.order.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      prisma.storeInventory.count({
        where: { availableStock: { lte: 5 } },
      }),
      prisma.product.count({ where: { isActive: true } }),
    ]);
    return c.json({ data: { ordersToday, lowStock, activeProducts: products } });
  });

  app.get("/orders", async (c) => {
    requireRole(c, ["ADMIN"]);
    const deliveryDate = c.req.query("deliveryDate");
    const slotId = c.req.query("slotId");
    const orders = await prisma.order.findMany({
      where: {
        ...(deliveryDate ? { deliveryDate: new Date(`${deliveryDate}T00:00:00.000Z`) } : {}),
        ...(slotId ? { deliverySlotId: slotId } : {}),
      },
      orderBy: [{ deliveryDate: "asc" }, { scheduledDeliveryAt: "asc" }],
      include: { user: { select: { id: true, name: true, email: true } }, items: true, address: true },
    });
    return c.json({ data: orders });
  });

  app.patch(
    "/orders/:id/status",
    zValidator("json", z.object({
      status: z.nativeEnum(OrderStatus),
      expectedStatus: z.nativeEnum(OrderStatus),
    }).strict()),
    async (c) => {
      const user = requireRole(c, ["ADMIN"]);
      const id = c.req.param("id");
      const { status, expectedStatus } = c.req.valid("json");
      const result = await transitionStaffOrder({
        user,
        orderId: id,
        nextStatus: status,
        expectedStatus,
      });
      return c.json(result);
    },
  );

  app.get("/products", async (c) => {
    requireRole(c, adminRoles);
    const products = await prisma.product.findMany({
      include: { category: true, images: true, inventory: true },
      orderBy: { updatedAt: "desc" },
    });
    return c.json({ data: products });
  });

  app.post(
    "/products",
    zValidator(
      "json",
      z.object({
        name: z.string(),
        slug: z.string(),
        sku: z.string(),
        categoryId: z.string(),
        mrp: z.number(),
        sellingPrice: z.number(),
        brand: z.string().optional(),
        description: z.string().optional(),
        packageSize: z.string().optional(),
        imageUrl: z.string().optional(),
        storeId: z.string(),
        stock: z.number().int().default(0),
      }),
    ),
    async (c) => {
      requireRole(c, ["ADMIN", "STORE_MANAGER"]);
      const body = c.req.valid("json");
      const product = await prisma.product.create({
        data: {
          name: body.name,
          slug: body.slug,
          sku: body.sku,
          categoryId: body.categoryId,
          mrp: body.mrp,
          sellingPrice: body.sellingPrice,
          brand: body.brand,
          description: body.description,
          packageSize: body.packageSize,
          images: body.imageUrl ? { create: [{ url: body.imageUrl, sortOrder: 0 }] } : undefined,
          inventory: {
            create: {
              storeId: body.storeId,
              availableStock: body.stock,
              isAvailable: body.stock > 0,
            },
          },
        },
      });
      return c.json({ data: product }, 201);
    },
  );

  app.get("/categories", async (c) => {
    requireRole(c, adminRoles);
    const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
    return c.json({ data: categories });
  });

  app.get("/stores", async (c) => {
    requireRole(c, adminRoles);
    const stores = await prisma.store.findMany();
    return c.json({ data: stores });
  });

  app.get("/inventory", async (c) => {
    requireRole(c, adminRoles);
    const inventory = await prisma.storeInventory.findMany({
      include: { product: true, store: true },
      orderBy: { updatedAt: "desc" },
    });
    return c.json({ data: inventory });
  });

  app.patch(
    "/inventory/:id",
    zValidator("json", z.object({ availableStock: z.number().int().min(0) })),
    async (c) => {
      requireRole(c, ["ADMIN", "STORE_MANAGER"]);
      const id = c.req.param("id");
      const body = c.req.valid("json");
      const updated = await prisma.storeInventory.update({
        where: { id },
        data: {
          availableStock: body.availableStock,
          isAvailable: body.availableStock > 0,
        },
      });
      await prisma.inventoryMovement.create({
        data: {
          inventoryId: id,
          type: "ADJUSTMENT",
          quantity: body.availableStock,
          note: "Admin adjustment",
        },
      });
      return c.json({ data: updated });
    },
  );

  app.get("/delivery-schedule", async (c) => {
    requireRole(c, adminRoles);
    const counts = await prisma.order.groupBy({
      by: ["deliverySlotId", "deliveryDate"],
      _count: { _all: true },
    });
    return c.json({ data: { slots: DELIVERY_SLOTS, orderCounts: counts } });
  });

  app.get("/customers", async (c) => {
    requireRole(c, ["ADMIN"]);
    const customers = await prisma.user.findMany({
      where: { role: "CUSTOMER" },
      select: { id: true, name: true, email: true, phone: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return c.json({ data: customers });
  });

  app.get("/coupons", async (c) => {
    requireRole(c, ["ADMIN"]);
    const coupons = await prisma.coupon.findMany();
    return c.json({ data: coupons });
  });

  app.get("/settings", async (c) => {
    requireRole(c, ["ADMIN"]);
    const settings = await prisma.appSetting.findMany();
    return c.json({ data: settings });
  });

  return app;
}
