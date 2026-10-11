"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function AdminDeliverySchedulePage() {
  const schedule = useQuery({
    queryKey: ["admin-delivery"],
    queryFn: () =>
      api<{
        data: {
          slots: {
            slotId: string;
            name: string;
            orderWindowStart: string;
            orderWindowEnd: string;
            deliveryTime: string;
            active: boolean;
          }[];
          orderCounts: { deliverySlotId: string; deliveryDate: string; _count: { _all: number } }[];
        };
      }>("/api/v1/admin/delivery-schedule"),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Delivery schedule (read-only)</h1>
      <p className="text-sm text-slate-600">Timezone: Asia/Kolkata · Five fixed daily slots</p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">Slot</th>
              <th className="p-3">Order window</th>
              <th className="p-3">Delivery time</th>
              <th className="p-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {schedule.data?.data.slots.map((slot) => (
              <tr key={slot.slotId} className="border-t">
                <td className="p-3 font-medium">
                  {slot.name} ({slot.slotId})
                </td>
                <td className="p-3">
                  {slot.orderWindowStart} – {slot.orderWindowEnd}
                </td>
                <td className="p-3">{slot.deliveryTime}</td>
                <td className="p-3">{slot.active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section>
        <h2 className="font-semibold">Orders by slot & date</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {schedule.data?.data.orderCounts.map((row, i) => (
            <li key={i}>
              {row.deliverySlotId} · {String(row.deliveryDate).slice(0, 10)} · {row._count._all} orders
            </li>
          )) ?? <li>No orders yet.</li>}
        </ul>
      </section>
    </div>
  );
}
