import { Hono } from "hono";
import { DELIVERY_SLOTS } from "../../modules/delivery/delivery-schedule.types.js";
import { previewDeliverySlot } from "../../modules/delivery/delivery-schedule.service.js";
import { prisma } from "@vedaa/database";
import { BUSINESS_TIMEZONE } from "@vedaa/shared";

export function createDeliveryRoutes() {
  const app = new Hono();

  app.get("/slots", async (c) => {
    const counts = await prisma.order.groupBy({
      by: ["deliverySlotId"],
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((x) => [x.deliverySlotId, x._count._all]));
    return c.json({
      timezone: BUSINESS_TIMEZONE,
      data: DELIVERY_SLOTS.map((slot) => ({
        ...slot,
        orderCount: countMap.get(slot.slotId) ?? 0,
      })),
    });
  });

  app.post("/preview", async (c) => {
    const preview = previewDeliverySlot(new Date());
    return c.json({ data: preview });
  });

  return app;
}
