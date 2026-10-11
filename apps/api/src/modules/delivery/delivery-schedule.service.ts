import { DateTime } from "luxon";
import { BUSINESS_TIMEZONE } from "@vedaa/shared";
import type { DeliveryAssignment, DeliverySlotId } from "./delivery-schedule.types.js";

/** Minutes since midnight in IST for half-open interval checks. */
function minutesSinceMidnight(dt: DateTime): number {
  return dt.hour * 60 + dt.minute + dt.second / 60 + dt.millisecond / 60000;
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function formatDate(dt: DateTime): string {
  return dt.toFormat("yyyy-MM-dd");
}

function formatTime(dt: DateTime): string {
  return dt.toFormat("HH:mm");
}

function buildScheduledAt(deliveryDate: string, deliveryTime: string): DateTime {
  const [h, m] = deliveryTime.split(":").map(Number);
  const [y, mo, d] = deliveryDate.split("-").map(Number);
  return DateTime.fromObject(
    { year: y, month: mo, day: d, hour: h, minute: m, second: 0, millisecond: 0 },
    { zone: BUSINESS_TIMEZONE },
  );
}

function relativeDeliveryLabel(scheduled: DateTime, nowIst: DateTime): string {
  const deliveryDay = scheduled.startOf("day");
  const today = nowIst.startOf("day");
  const diffDays = deliveryDay.diff(today, "days").days;
  const timeLabel = scheduled.toFormat("h:mm a");

  if (diffDays === 0) {
    return `Your order will arrive today by ${timeLabel}.`;
  }
  if (diffDays === 1) {
    return `Your order will arrive tomorrow by ${timeLabel}.`;
  }
  return `Scheduled delivery by ${scheduled.toFormat("MMM d")} at ${timeLabel}.`;
}

function shortPreviewLabel(scheduled: DateTime, nowIst: DateTime): string {
  const deliveryDay = scheduled.startOf("day");
  const today = nowIst.startOf("day");
  const diffDays = deliveryDay.diff(today, "days").days;
  const timeLabel = scheduled.toFormat("h:mm a");

  if (diffDays === 0) {
    return `Order now for delivery by ${timeLabel} today.`;
  }
  if (diffDays === 1) {
    return `Order now for delivery by ${timeLabel} tomorrow.`;
  }
  return `Order now for delivery by ${timeLabel} on ${scheduled.toFormat("MMM d")}.`;
}

interface SlotResolution {
  slotId: DeliverySlotId;
  orderWindow: string;
  deliveryTime: string;
  deliveryDate: DateTime;
}

function resolveSlot(orderIst: DateTime): SlotResolution {
  const mins = minutesSinceMidnight(orderIst);

  const m2100 = parseHm("21:00");
  const m0800 = parseHm("08:00");
  const m1130 = parseHm("11:30");
  const m1430 = parseHm("14:30");
  const m1830 = parseHm("18:30");
  const m2050 = parseHm("20:50");

  const dayStart = orderIst.startOf("day");

  // 21:00 <= t OR t < 08:00 -> 8:30 AM (same day if before 08:00, next day if >= 21:00)
  if (mins >= m2100 || mins < m0800) {
    const deliveryDate =
      mins >= m2100 ? dayStart.plus({ days: 1 }) : dayStart;
    return {
      slotId: "MORNING_0830",
      orderWindow: "21:00-08:00",
      deliveryTime: "08:30",
      deliveryDate,
    };
  }

  // 20:50 PM to 21:00 PM gap -> next morning 8:30
  if (mins >= m2050 && mins < m2100) {
    return {
      slotId: "MORNING_0830",
      orderWindow: "20:50-21:00",
      deliveryTime: "08:30",
      deliveryDate: dayStart.plus({ days: 1 }),
    };
  }

  if (mins >= m0800 && mins < m1130) {
    return {
      slotId: "NOON_1200",
      orderWindow: "08:00-11:30",
      deliveryTime: "12:00",
      deliveryDate: dayStart,
    };
  }

  if (mins >= m1130 && mins < m1430) {
    return {
      slotId: "AFTERNOON_1500",
      orderWindow: "11:30-14:30",
      deliveryTime: "15:00",
      deliveryDate: dayStart,
    };
  }

  if (mins >= m1430 && mins < m1830) {
    return {
      slotId: "EVENING_1900",
      orderWindow: "14:30-18:30",
      deliveryTime: "19:00",
      deliveryDate: dayStart,
    };
  }

  if (mins >= m1830 && mins < m2050) {
    return {
      slotId: "NIGHT_2130",
      orderWindow: "18:30-20:50",
      deliveryTime: "21:30",
      deliveryDate: dayStart,
    };
  }

  throw new Error(`Unhandled order time in delivery schedule: ${orderIst.toISO()}`);
}

/**
 * Authoritative delivery assignment from an order timestamp (UTC instant).
 */
export function assignDeliverySlot(orderTimestamp: Date): DeliveryAssignment {
  const orderIst = DateTime.fromJSDate(orderTimestamp, { zone: "utc" }).setZone(
    BUSINESS_TIMEZONE,
  );
  const nowIst = orderIst;
  const resolved = resolveSlot(orderIst);
  const deliveryDateStr = formatDate(resolved.deliveryDate);
  const scheduled = buildScheduledAt(deliveryDateStr, resolved.deliveryTime);

  return {
    slotId: resolved.slotId,
    orderWindow: resolved.orderWindow,
    deliveryDate: deliveryDateStr,
    deliveryTime: resolved.deliveryTime,
    scheduledDeliveryAt: scheduled.toUTC().toISO() ?? scheduled.toISO()!,
    orderTimestampIst: orderIst.toISO()!,
    timezone: BUSINESS_TIMEZONE,
    label: relativeDeliveryLabel(scheduled, nowIst),
  };
}

export function previewDeliverySlot(now: Date = new Date()): DeliveryAssignment & {
  previewLabel: string;
} {
  const assignment = assignDeliverySlot(now);
  const nowIst = DateTime.fromJSDate(now, { zone: "utc" }).setZone(BUSINESS_TIMEZONE);
  const scheduled = DateTime.fromISO(assignment.scheduledDeliveryAt, { zone: "utc" }).setZone(
    BUSINESS_TIMEZONE,
  );
  return {
    ...assignment,
    previewLabel: shortPreviewLabel(scheduled, nowIst),
  };
}
