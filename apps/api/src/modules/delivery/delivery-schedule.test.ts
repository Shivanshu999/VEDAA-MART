import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { assignDeliverySlot } from "./delivery-schedule.service.js";

const TZ = "Asia/Kolkata";

/** Build UTC Date from IST local wall clock (for deterministic tests). */
function ist(y: number, mo: number, d: number, h: number, mi: number, s = 0, ms = 0): Date {
  const dt = DateTime.fromObject(
    { year: y, month: mo, day: d, hour: h, minute: mi, second: s, millisecond: ms },
    { zone: TZ },
  );
  return dt.toUTC().toJSDate();
}

describe("assignDeliverySlot boundaries (IST)", () => {
  const baseDate = { y: 2026, mo: 10, d: 11 };

  it("07:59:59 -> 08:30 AM that day", () => {
    const r = assignDeliverySlot(ist(baseDate.y, baseDate.mo, baseDate.d, 7, 59, 59));
    expect(r.slotId).toBe("MORNING_0830");
    expect(r.deliveryDate).toBe("2026-10-11");
    expect(r.deliveryTime).toBe("08:30");
  });

  it("08:00:00 -> 12:00 PM that day", () => {
    const r = assignDeliverySlot(ist(baseDate.y, baseDate.mo, baseDate.d, 8, 0, 0));
    expect(r.slotId).toBe("NOON_1200");
    expect(r.deliveryTime).toBe("12:00");
  });

  it("11:29:59 -> 12:00 PM that day", () => {
    const r = assignDeliverySlot(ist(baseDate.y, baseDate.mo, baseDate.d, 11, 29, 59));
    expect(r.slotId).toBe("NOON_1200");
  });

  it("11:30:00 -> 03:00 PM that day", () => {
    const r = assignDeliverySlot(ist(baseDate.y, baseDate.mo, baseDate.d, 11, 30, 0));
    expect(r.slotId).toBe("AFTERNOON_1500");
    expect(r.deliveryTime).toBe("15:00");
  });

  it("02:29:59 PM -> 03:00 PM that day", () => {
    const r = assignDeliverySlot(ist(baseDate.y, baseDate.mo, baseDate.d, 14, 29, 59));
    expect(r.slotId).toBe("AFTERNOON_1500");
  });

  it("02:30:00 PM -> 07:00 PM that day", () => {
    const r = assignDeliverySlot(ist(baseDate.y, baseDate.mo, baseDate.d, 14, 30, 0));
    expect(r.slotId).toBe("EVENING_1900");
    expect(r.deliveryTime).toBe("19:00");
  });

  it("06:29:59 PM -> 07:00 PM that day", () => {
    const r = assignDeliverySlot(ist(baseDate.y, baseDate.mo, baseDate.d, 18, 29, 59));
    expect(r.slotId).toBe("EVENING_1900");
  });

  it("06:30:00 PM -> 09:30 PM that day", () => {
    const r = assignDeliverySlot(ist(baseDate.y, baseDate.mo, baseDate.d, 18, 30, 0));
    expect(r.slotId).toBe("NIGHT_2130");
    expect(r.deliveryTime).toBe("21:30");
  });

  it("08:49:59 PM -> 09:30 PM that day", () => {
    const r = assignDeliverySlot(ist(baseDate.y, baseDate.mo, baseDate.d, 20, 49, 59));
    expect(r.slotId).toBe("NIGHT_2130");
  });

  it("08:50:00 PM -> 08:30 AM the following day", () => {
    const r = assignDeliverySlot(ist(baseDate.y, baseDate.mo, baseDate.d, 20, 50, 0));
    expect(r.slotId).toBe("MORNING_0830");
    expect(r.deliveryDate).toBe("2026-10-12");
  });

  it("08:59:59 PM -> 08:30 AM the following day", () => {
    const r = assignDeliverySlot(ist(baseDate.y, baseDate.mo, baseDate.d, 20, 59, 59));
    expect(r.slotId).toBe("MORNING_0830");
    expect(r.deliveryDate).toBe("2026-10-12");
  });

  it("09:00:00 PM -> 08:30 AM the following day", () => {
    const r = assignDeliverySlot(ist(baseDate.y, baseDate.mo, baseDate.d, 21, 0, 0));
    expect(r.slotId).toBe("MORNING_0830");
    expect(r.deliveryDate).toBe("2026-10-12");
  });

  it("11:59:59 PM -> 08:30 AM the following day", () => {
    const r = assignDeliverySlot(ist(baseDate.y, baseDate.mo, baseDate.d, 23, 59, 59));
    expect(r.deliveryDate).toBe("2026-10-12");
  });

  it("12:00:00 AM -> 08:30 AM that day", () => {
    const r = assignDeliverySlot(ist(baseDate.y, baseDate.mo, baseDate.d, 0, 0, 0));
    expect(r.slotId).toBe("MORNING_0830");
    expect(r.deliveryDate).toBe("2026-10-11");
  });
});

describe("assignDeliverySlot timezone and calendar edges", () => {
  it("uses Asia/Kolkata regardless of input interpreted as UTC instant", () => {
    const order = ist(2026, 10, 11, 8, 0, 0);
    const r = assignDeliverySlot(order);
    expect(r.timezone).toBe("Asia/Kolkata");
    expect(r.orderTimestampIst).toContain("+05:30");
  });

  it("year transition midnight order", () => {
    const r = assignDeliverySlot(ist(2025, 12, 31, 23, 30, 0));
    expect(r.deliveryDate).toBe("2026-01-01");
    expect(r.deliveryTime).toBe("08:30");
  });

  it("leap day morning window before 8 AM", () => {
    const r = assignDeliverySlot(ist(2024, 2, 29, 2, 0, 0));
    expect(r.deliveryDate).toBe("2024-02-29");
    expect(r.deliveryTime).toBe("08:30");
  });

  it("persists consistent scheduledDeliveryAt for same order instant", () => {
    const order = ist(2026, 10, 11, 10, 15, 0);
    const first = assignDeliverySlot(order);
    const second = assignDeliverySlot(order);
    expect(first.scheduledDeliveryAt).toBe(second.scheduledDeliveryAt);
    expect(first.slotId).toBe("NOON_1200");
  });

  it("browser-offset simulation: UTC instant maps to correct IST slot", () => {
    // 11:30 IST = 06:00 UTC
    const utc = DateTime.fromObject(
      { year: 2026, month: 10, day: 11, hour: 6, minute: 0 },
      { zone: "utc" },
    ).toJSDate();
    const r = assignDeliverySlot(utc);
    expect(r.slotId).toBe("AFTERNOON_1500");
  });
});
