"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useState } from "react";

export type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  brand?: string | null;
  mrp: number;
  sellingPrice: number;
  discountPercent: number;
  packageSize?: string | null;
  packageUnit?: string | null;
  images?: { url: string }[];
  inStock?: boolean;
};

export function ProductCard({ product }: { product: ProductSummary }) {
  const [loading, setLoading] = useState(false);
  const image = product.images?.[0]?.url;

  async function addToCart() {
    setLoading(true);
    try {
      await api("/api/v1/cart/items", {
        method: "POST",
        json: { productId: product.id, quantity: 1 },
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="group overflow-hidden border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/products/${product.slug}`} className="relative block aspect-square overflow-hidden bg-slate-50">
        {image ? (
          <Image src={image} alt={product.name} fill className="object-cover p-4 transition-transform duration-200 group-hover:scale-[1.02]" sizes="(max-width:768px) 50vw, 20vw" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">No image</div>
        )}
        {product.discountPercent > 0 && (
          <Badge className="absolute left-3 top-3 rounded-full bg-brand text-white hover:bg-brand">
            {product.discountPercent}% OFF
          </Badge>
        )}
      </Link>
      <CardContent className="flex flex-1 flex-col p-3">
        {product.brand && <p className="text-xs text-slate-500">{product.brand}</p>}
        <Link href={`/products/${product.slug}`} className="line-clamp-2 text-sm font-medium text-slate-900">
          {product.name}
        </Link>
        {(product.packageSize || product.packageUnit) && <p className="mt-1 text-xs text-slate-500">{[product.packageSize, product.packageUnit].filter(Boolean).join(" ")}</p>}
        <div className="mt-auto flex items-end justify-between pt-3">
          <div>
            <p className="text-lg font-semibold text-slate-900">{formatINR(product.sellingPrice)}{product.packageUnit === "kg" && <span className="ml-1 text-xs font-normal text-slate-500">/ kg</span>}</p>
            {product.mrp > product.sellingPrice && (
              <p className="text-xs text-slate-400 line-through">{formatINR(product.mrp)}</p>
            )}
          </div>
          <Button size="icon" variant={product.inStock ? "default" : "outline"} disabled={!product.inStock || loading} onClick={addToCart} aria-label={`Add ${product.name} to cart`}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
