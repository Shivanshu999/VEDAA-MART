import Image from "next/image";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { ProductCard, type ProductSummary } from "@/components/product-card";
import { AddToCartPanel } from "./add-to-cart-panel";

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let product: ProductSummary | null = null;
  let related: ProductSummary[] = [];

  try {
    const res = await api<{ data: ProductSummary; related: ProductSummary[] }>(`/api/v1/products/${slug}`);
    product = res.data;
    related = res.related;
  } catch {
    return <p className="text-slate-500">Product not found.</p>;
  }

  const image = product.images?.[0]?.url;

  return (
    <div className="space-y-10">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
          {image && <Image src={image} alt={product.name} fill className="object-contain p-6" />}
        </div>
        <div className="space-y-4">
          {product.brand && <p className="text-sm text-slate-500">{product.brand}</p>}
          <h1 className="text-3xl font-bold text-slate-900">{product.name}</h1>
          {(product.packageSize || product.packageUnit) && <p className="text-sm text-slate-600">{[product.packageSize, product.packageUnit].filter(Boolean).join(" ")}</p>}
          <div className="flex items-baseline gap-3">
            <p className="text-3xl font-semibold">{formatINR(product.sellingPrice)}{product.packageUnit === "kg" && <span className="ml-1 text-base font-normal text-slate-500">/ kg</span>}</p>
            {product.mrp > product.sellingPrice && (
              <>
                <p className="text-lg text-slate-400 line-through">{formatINR(product.mrp)}</p>
                <p className="rounded-full bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand-foreground">
                  {product.discountPercent}% off
                </p>
              </>
            )}
          </div>
          <p className="text-sm text-slate-600">
            {product.inStock ? "In stock · Ready for scheduled delivery" : "Currently unavailable"}
          </p>
          <AddToCartPanel productId={product.id} inStock={!!product.inStock} />
        </div>
      </div>
      {related.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">Related products</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
