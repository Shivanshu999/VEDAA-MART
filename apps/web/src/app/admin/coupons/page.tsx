"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function AdminCouponsPage() {
  const coupons = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: () => api<{ data: { code: string; type: string; value: string; isActive: boolean }[] }>("/api/v1/admin/coupons"),
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Coupons</h1>
      <ul className="space-y-2 text-sm">
        {coupons.data?.data.map((c) => (
          <li key={c.code} className="rounded-xl border p-3">
            {c.code} · {c.type} · ₹{c.value} · {c.isActive ? "Active" : "Inactive"}
          </li>
        ))}
      </ul>
    </div>
  );
}
