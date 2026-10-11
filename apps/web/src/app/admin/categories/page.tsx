"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function AdminCategoriesPage() {
  const categories = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => api<{ data: { name: string; slug: string; isActive: boolean }[] }>("/api/v1/admin/categories"),
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Categories</h1>
      <ul className="space-y-2 text-sm">
        {categories.data?.data.map((c) => (
          <li key={c.slug} className="rounded-xl border p-3">
            {c.name} · /{c.slug} · {c.isActive ? "Active" : "Hidden"}
          </li>
        ))}
      </ul>
    </div>
  );
}
