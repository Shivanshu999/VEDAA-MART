"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function AdminDashboardPage() {
  const stats = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => api<{ data: { ordersToday: number; lowStock: number; activeProducts: number } }>("/api/v1/admin/dashboard"),
  });

  const d = stats.data?.data;
  return (
    <div>
      <h1 className="text-2xl font-bold">Operations overview</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Orders today" value={d?.ordersToday ?? "—"} />
        <Stat label="Low stock SKUs" value={d?.lowStock ?? "—"} />
        <Stat label="Active products" value={d?.activeProducts ?? "—"} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
