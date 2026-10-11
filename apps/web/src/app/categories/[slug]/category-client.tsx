"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export function CategoryClientControls({ slug }: { slug: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const currentSort = params.get("sort") ?? "popular";

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search in category"
        aria-label="Search in category"
      />
      <Select
        value={currentSort}
        onValueChange={(value) => {
          const next = new URLSearchParams(params.toString());
          next.set("sort", value);
          router.push(`/categories/${slug}?${next}`);
        }}
      >
        <SelectTrigger className="w-full sm:w-[220px]">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="popular">Popular</SelectItem>
          <SelectItem value="price_asc">Price: Low to High</SelectItem>
          <SelectItem value="price_desc">Price: High to Low</SelectItem>
          <SelectItem value="newest">Newest</SelectItem>
        </SelectContent>
      </Select>
      <Button
        onClick={() => {
          const next = new URLSearchParams(params.toString());
          if (q) next.set("q", q);
          else next.delete("q");
          router.push(`/categories/${slug}?${next}`);
        }}
      >
        Apply
      </Button>
    </div>
  );
}
