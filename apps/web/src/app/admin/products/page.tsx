"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function AdminProductsPage() {
  const products = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => api<{ data: { id: string; name: string; sku: string; sellingPrice: string; isActive: boolean }[] }>("/api/v1/admin/products"),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Products</h1>
      <div className="overflow-x-auto rounded-2xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">SKU</th>
              <th className="p-3 text-left">Price</th>
              <th className="p-3 text-left">Active</th>
            </tr>
          </thead>
          <tbody>
            {products.data?.data.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.name}</td>
                <td className="p-3">{p.sku}</td>
                <td className="p-3">₹{p.sellingPrice}</td>
                <td className="p-3">{p.isActive ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
