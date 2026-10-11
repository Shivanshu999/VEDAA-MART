"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type CartResponse = {
  data: {
    items: {
      id: string;
      quantity: number;
      product: { name: string; slug: string; sellingPrice: number; image?: string | null };
    }[];
    totals: {
      subtotal: number;
      discountTotal: number;
      deliveryFee: number;
      handlingFee: number;
      taxTotal: number;
      grandTotal: number;
    } | null;
  };
};

export default function CartPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["cart"],
    queryFn: () => api<CartResponse>("/api/v1/cart"),
  });

  const cart = data?.data;

  if (isLoading) return <p>Loading cart…</p>;
  if (!cart?.items.length) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center">
        <p className="text-slate-600">Your cart is empty.</p>
        <Button asChild className="mt-4">
          <Link href="/">Continue shopping</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {cart.items.map((item) => (
          <div key={item.id} className="flex gap-4 rounded-2xl border border-slate-200 p-4">
            <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-slate-50">
              {item.product.image && (
                <Image src={item.product.image} alt={item.product.name} fill className="object-cover" />
              )}
            </div>
            <div className="flex-1">
              <Link href={`/products/${item.product.slug}`} className="font-medium">
                {item.product.name}
              </Link>
              <p className="text-sm text-slate-600">{formatINR(item.product.sellingPrice)} each</p>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await api(`/api/v1/cart/items/${item.id}`, {
                      method: "PATCH",
                      json: { quantity: Math.max(1, item.quantity - 1) },
                    });
                    refetch();
                  }}
                >
                  −
                </Button>
                <span className="text-sm">{item.quantity}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await api(`/api/v1/cart/items/${item.id}`, {
                      method: "PATCH",
                      json: { quantity: item.quantity + 1 },
                    });
                    refetch();
                  }}
                >
                  +
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await api(`/api/v1/cart/items/${item.id}`, { method: "DELETE" });
                    refetch();
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <aside className="h-fit rounded-2xl border border-slate-200 p-5">
        <h2 className="text-lg font-semibold">Bill details</h2>
        {cart.totals && (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatINR(cart.totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Delivery fee</dt>
              <dd>{formatINR(cart.totals.deliveryFee)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Taxes</dt>
              <dd>{formatINR(cart.totals.taxTotal)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd>{formatINR(cart.totals.grandTotal)}</dd>
            </div>
          </dl>
        )}
        <Button asChild className="mt-4 w-full">
          <Link href="/checkout">Proceed to checkout</Link>
        </Button>
      </aside>
    </div>
  );
}
