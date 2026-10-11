import { BUSINESS_TIMEZONE } from "@vedaa/shared";

export type DeliverySlotId =
  | "MORNING_0830"
  | "NOON_1200"
  | "AFTERNOON_1500"
  | "EVENING_1900"
  | "NIGHT_2130";

export interface DeliverySlotDefinition {
  slotId: DeliverySlotId;
  name: string;
  orderWindowStart: string;
  orderWindowEnd: string;
  deliveryTime: string;
  active: boolean;
}

export interface DeliveryAssignment {
  slotId: DeliverySlotId;
  orderWindow: string;
  deliveryDate: string;
  deliveryTime: string;
  scheduledDeliveryAt: string;
  orderTimestampIst: string;
  timezone: typeof BUSINESS_TIMEZONE;
  label: string;
}

export const DELIVERY_SLOTS: DeliverySlotDefinition[] = [
  {
    slotId: "MORNING_0830",
    name: "Morning",
    orderWindowStart: "21:00",
    orderWindowEnd: "08:00",
    deliveryTime: "08:30",
    active: true,
  },
  {
    slotId: "NOON_1200",
    name: "Noon",
    orderWindowStart: "08:00",
    orderWindowEnd: "11:30",
    deliveryTime: "12:00",
    active: true,
  },
  {
    slotId: "AFTERNOON_1500",
    name: "Afternoon",
    orderWindowStart: "11:30",
    orderWindowEnd: "14:30",
    deliveryTime: "15:00",
    active: true,
  },
  {
    slotId: "EVENING_1900",
    name: "Evening",
    orderWindowStart: "14:30",
    orderWindowEnd: "18:30",
    deliveryTime: "19:00",
    active: true,
  },
  {
    slotId: "NIGHT_2130",
    name: "Night",
    orderWindowStart: "18:30",
    orderWindowEnd: "20:50",
    deliveryTime: "21:30",
    active: true,
  },
];
