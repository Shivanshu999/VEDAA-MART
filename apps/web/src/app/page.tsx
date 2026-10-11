import Link from "next/link";
import { api } from "@/lib/api";
import { ProductCard, type ProductSummary } from "@/components/product-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Truck } from "lucide-react";

async function getHomeData() {
  try {
    const [categories, products, delivery] = await Promise.all([
      api<{ data: { id: string; name: string; slug: string; imageUrl?: string | null }[] }>("/api/v1/categories"),
      api<{ data: ProductSummary[] }>("/api/v1/products?limit=12"),
      api<{ data: { previewLabel: string; label: string } }>("/api/v1/delivery/preview", { method: "POST" }),
    ]);
    return { categories: categories.data, products: products.data, delivery: delivery.data };
  } catch {
    return { categories: [], products: [], delivery: null };
  }
}

export default async function HomePage() {
  const { categories, products, delivery } = await getHomeData();

  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-3xl border border-brand/20 bg-gradient-to-r from-brand-light to-white p-6 md:p-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl space-y-4">
            <Badge className="inline-flex items-center gap-2 bg-white text-brand hover:bg-white">
              <Truck className="h-3.5 w-3.5" />
              Scheduled delivery · Asia/Kolkata
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Groceries delivered on time, every day.
            </h1>
            <p className="text-slate-600">
              Shop fresh produce, staples, and daily essentials from Vedaa Mart. Five fixed delivery windows — no guesswork.
            </p>
            {delivery && (
              <p className="flex items-center gap-2 text-sm font-medium text-brand-foreground">
                <Clock className="h-4 w-4" />
                {delivery.previewLabel}
              </p>
            )}
            <Button asChild size="lg">
              <Link href="/categories/fresh-fruits">Start shopping</Link>
            </Button>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Shop by category</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((cat) => (
            <Link key={cat.id} href={`/categories/${cat.slug}`} className="block">
              <Card className="h-full border-slate-200 bg-white transition-colors hover:border-brand/40 hover:bg-slate-50">
                <CardContent className="flex h-full items-center justify-center p-4 text-center">
                  <p className="font-medium text-slate-900">{cat.name}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Popular picks</h2>
        {products.length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-slate-50">
            <CardContent className="p-8 text-center text-slate-500">
              Products will appear once the API and database are running. See README for setup.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
