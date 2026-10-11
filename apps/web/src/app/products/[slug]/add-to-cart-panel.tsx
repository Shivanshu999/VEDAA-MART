"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function AddToCartPanel({ productId, inStock }: { productId: string; inStock: boolean }) {
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium" htmlFor="qty">
          Quantity
        </label>
        <input
          id="qty"
          type="number"
          min={1}
          max={20}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="h-10 w-20 rounded-md border border-slate-200 px-2"
        />
      </div>
      <Button
        disabled={!inStock || loading}
        className="w-full"
        onClick={async () => {
          setLoading(true);
          setMessage(null);
          try {
            await api("/api/v1/cart/items", { method: "POST", json: { productId, quantity: qty } });
            setMessage("Added to cart");
          } catch {
            setMessage("Please log in to add items to your cart.");
          } finally {
            setLoading(false);
          }
        }}
      >
        Add to cart
      </Button>
      {message && <p className="text-sm text-brand-foreground">{message}</p>}
    </div>
  );
}
