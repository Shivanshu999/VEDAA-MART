import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "@vedaa/database";
import type { Auth } from "../../lib/auth.js";
import { attachSession, requireAuth } from "../../middleware/session.js";
import { AppError } from "@vedaa/shared";

const addressSchema = z.object({
  label: z.string().default("Home"),
  line1: z.string().min(3),
  line2: z.string().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  postalCode: z.string().min(4),
  country: z.string().default("IN"),
  isDefault: z.boolean().optional(),
});

export function createAddressesRoutes(auth: Auth) {
  const app = new Hono();
  app.use("*", async (c, next) => attachSession(auth, c, next));

  app.get("/", async (c) => {
    const user = requireAuth(c);
    const addresses = await prisma.address.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return c.json({ data: addresses });
  });

  app.post("/", zValidator("json", addressSchema), async (c) => {
    const user = requireAuth(c);
    const body = c.req.valid("json");
    if (body.isDefault) {
      await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    }
    const created = await prisma.address.create({
      data: { ...body, userId: user.id, isServiceable: true },
    });
    return c.json({ data: created }, 201);
  });

  app.patch("/:id", zValidator("json", addressSchema.partial()), async (c) => {
    const user = requireAuth(c);
    const id = c.req.param("id");
    const existing = await prisma.address.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw new AppError("Address not found", "NOT_FOUND", 404);
    const body = c.req.valid("json");
    if (body.isDefault) {
      await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    }
    const updated = await prisma.address.update({ where: { id }, data: body });
    return c.json({ data: updated });
  });

  app.delete("/:id", async (c) => {
    const user = requireAuth(c);
    const id = c.req.param("id");
    const existing = await prisma.address.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw new AppError("Address not found", "NOT_FOUND", 404);
    await prisma.address.delete({ where: { id } });
    return c.json({ success: true });
  });

  return app;
}
