import { api } from "@/lib/api";
import { ProductCard, type ProductSummary } from "@/components/product-card";
import { CategoryClientControls } from "./category-client";

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = sp.page ?? "1";
  const query = new URLSearchParams({
    categorySlug: slug,
    page,
    limit: "24",
    ...(sp.q ? { q: sp.q } : {}),
    ...(sp.sort ? { sort: sp.sort } : {}),
  });

  let categoryName = slug.replace(/-/g, " ");
  let products: ProductSummary[] = [];
  let totalPages = 1;

  try {
    const [cat, list] = await Promise.all([
      api<{ data: { name: string } }>(`/api/v1/categories/${slug}`),
      api<{ data: ProductSummary[]; pagination: { totalPages: number } }>(`/api/v1/products?${query}`),
    ]);
    categoryName = cat.data.name;
    products = list.data;
    totalPages = list.pagination.totalPages;
  } catch {
    /* empty */
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold capitalize text-slate-900">{categoryName}</h1>
        <p className="text-sm text-slate-600">Fresh selection with scheduled Vedaa Mart delivery.</p>
      </div>
      <CategoryClientControls slug={slug} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {products.length === 0 && (
        <p className="text-center text-slate-500">No products found in this category.</p>
      )}
      {totalPages > 1 && (
        <p className="text-center text-sm text-slate-500">
          Page {page} of {totalPages}
        </p>
      )}
    </div>
  );
}
