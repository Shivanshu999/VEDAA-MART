"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, Search, ShoppingCart, User } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function SiteHeader() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [q, setQ] = useState("");

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-sm font-bold text-white shadow-sm">
              VM
            </span>
            <span className="text-lg font-semibold tracking-tight text-slate-900">
              Vedaa <span className="text-brand">Mart</span>
            </span>
          </Link>
          <Badge variant="secondary" className="hidden items-center gap-1 bg-brand/10 text-brand hover:bg-brand/10 md:inline-flex">
            <MapPin className="h-3.5 w-3.5" />
            Bengaluru · Indiranagar
          </Badge>
        </div>

        <form
          className="flex flex-1 items-center gap-2 md:max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search groceries, brands & categories"
              className="pl-9"
              aria-label="Search products"
            />
          </div>
          <Button type="submit" className="shrink-0">
            Search
          </Button>
        </form>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <Button variant="outline" size="sm" asChild>
            <Link href={session ? "/account" : "/login"}>
              <User className="mr-1.5 h-4 w-4" />
              {session ? "Account" : "Login"}
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/cart">
              <ShoppingCart className="mr-1.5 h-4 w-4" />
              Cart
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
