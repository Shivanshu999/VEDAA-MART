"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { ProductCard, type ProductSummary } from "@/components/product-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading search…</p>}>
      <SearchPageContent />
    </Suspense>
  );
}

function SearchPageContent() {
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [debounced, setDebounced] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ProductSummary[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!debounced) {
      setResults([]);
      return;
    }
    setLoading(true);
    api<{ data: ProductSummary[] }>(`/api/v1/products/search?q=${encodeURIComponent(debounced)}`)
      .then((res) => setResults(res.data))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [debounced]);

  const empty = useMemo(() => !loading && debounced && results.length === 0, [loading, debounced, results]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Search</h1>
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products or brands" />
        <Button variant="outline" onClick={() => setQ("")}>
          Clear
        </Button>
      </div>
      {loading && <p className="text-sm text-slate-500">Searching…</p>}
      {empty && <p className="rounded-xl border border-dashed p-6 text-center text-slate-500">No results for “{debounced}”.</p>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {results.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
