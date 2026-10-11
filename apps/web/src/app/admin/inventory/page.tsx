"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function AdminInventoryPage() {
  const inventory = useQuery({
    queryKey: ["admin-inventory"],
    queryFn: () =>
      api<{
        data: { id: string; availableStock: number; reservedStock: number; product: { name: string }; store: { name: string } }[];
      }>("/api/v1/admin/inventory"),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Inventory</h1>
      {inventory.data?.data.map((row) => (
        <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
          <div>
            <p className="font-medium">{row.product.name}</p>
            <p className="text-slate-500">{row.store.name}</p>
          </div>
          <p>
            Available {row.availableStock} · Reserved {row.reservedStock}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await api(`/api/v1/admin/inventory/${row.id}`, {
                method: "PATCH",
                json: { availableStock: row.availableStock + 10 },
              });
              inventory.refetch();
            }}
          >
            +10 stock
          </Button>
        </div>
      ))}
    </div>
  );
}
