"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function AdminCustomersPage() {
  const customers = useQuery({
    queryKey: ["admin-customers"],
    queryFn: () => api<{ data: { name: string | null; email: string; phone: string | null }[] }>("/api/v1/admin/customers"),
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Customers</h1>
      <ul className="space-y-2 text-sm">
        {customers.data?.data.map((u, i) => (
          <li key={i} className="rounded-xl border p-3">
            {u.name ?? "Customer"} · {u.email} {u.phone ? `· ${u.phone}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
