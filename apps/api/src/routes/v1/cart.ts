import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "@vedaa/database";
import type { Auth } from "../../lib/auth.js";
import { attachSession, requireAuth } from "../../middleware/session.js";
import { calculateCartTotals } from "../../modules/pricing/pricing.service.js";
import { AppError } from "@vedaa/shared";

async function getDefaultStoreId() {
  const store = await prisma.store.findFirst({ where: { isActive: true } });
  if (!store) throw new AppError("No active store", "STORE_NOT_FOUND", 503);
  return store.id;
}

async function getOrCreateCart(userId: string) {
  let cart = await prisma.cart.findFirst({
    where: { userId },
    include: {
      items: {
        include: {
          product: {
            include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } },
          },
        },
      },
    },
  });
  if (!cart) {
    const storeId = await getDefaultStoreId();
    cart = await prisma.cart.create({
      data: { userId, storeId },
      include: {
        items: {
          include: {
            product: {
              include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } },
            },
          },
        },
      },
    });
  }
  return cart;
}

export function createCartRoutes(auth: Auth) {
  const app = new Hono();
  app.use("*", async (c, next) => attachSession(auth, c, next));

  app.get("/", async (c) => {
    const user = requireAuth(c);
    const cart = await getOrCreateCart(user.id);
    const storeId = cart.storeId ?? (await getDefaultStoreId());
    const totals = await calculateCartTotals(
      storeId,
      cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    ).catch(() => null);

    return c.json({
      data: {
        id: cart.id,
        storeId,
        items: cart.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          product: {
            name: item.product.name,
            slug: item.product.slug,
            sellingPrice: Number(item.product.sellingPrice),
            mrp: Number(item.product.mrp),
            image: item.product.images[0]?.url ?? null,
          },
        })),
        totals: totals
          ? {
              subtotal: Number(totals.subtotal),
              discountTotal: Number(totals.discountTotal),
              deliveryFee: Number(totals.deliveryFee),
              handlingFee: Number(totals.handlingFee),
              taxTotal: Number(totals.taxTotal),
              grandTotal: Number(totals.grandTotal),
            }
          : null,
      },
    });
  });

  app.post(
    "/items",
    zValidator("json", z.object({ productId: z.string(), quantity: z.number().int().min(1).max(20) })),
    async (c) => {
      const user = requireAuth(c);
      const body = c.req.valid("json");
      const cart = await getOrCreateCart(user.id);
      const existing = cart.items.find((i) => i.productId === body.productId);
      if (existing) {
        await prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + body.quantity },
        });
      } else {
        await prisma.cartItem.create({
          data: { cartId: cart.id, productId: body.productId, quantity: body.quantity },
        });
      }
      return c.json({ success: true });
    },
  );

  app.patch(
    "/items/:id",
    zValidator("json", z.object({ quantity: z.number().int().min(1).max(20) })),
    async (c) => {
      const user = requireAuth(c);
      const cart = await getOrCreateCart(user.id);
      const itemId = c.req.param("id");
      const item = cart.items.find((i) => i.id === itemId);
      if (!item) throw new AppError("Cart item not found", "NOT_FOUND", 404);
      await prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity: c.req.valid("json").quantity },
      });
      return c.json({ success: true });
    },
  );

  app.delete("/items/:id", async (c) => {
    const user = requireAuth(c);
    const cart = await getOrCreateCart(user.id);
    const itemId = c.req.param("id");
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new AppError("Cart item not found", "NOT_FOUND", 404);
    await prisma.cartItem.delete({ where: { id: itemId } });
    return c.json({ success: true });
  });

  return app;
}
