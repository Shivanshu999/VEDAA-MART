"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function AccountPage() {
  const { data: session, isPending } = authClient.useSession();
  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api<{ data: unknown[] }>("/api/v1/addresses"),
    enabled: !!session,
  });

  if (isPending) return <p>Loading…</p>;
  if (!session) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p>Please log in to view your account.</p>
        <Button asChild className="mt-3">
          <Link href="/login">Login</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 p-6">
        <h1 className="text-2xl font-bold">My account</h1>
        <p className="mt-2 text-slate-600">{session.user.name ?? "Customer"}</p>
        <p className="text-sm text-slate-500">{session.user.email}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => authClient.signOut().then(() => window.location.assign("/"))}
        >
          Logout
        </Button>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Saved addresses</h2>
          <Button asChild size="sm" variant="outline">
            <Link href="/checkout">Add at checkout</Link>
          </Button>
        </div>
        <div className="space-y-2">
          {(addresses.data?.data as { id: string; line1: string; city: string; isDefault: boolean }[])?.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-200 p-4 text-sm">
              {a.isDefault && <span className="mr-2 rounded bg-brand-light px-2 py-0.5 text-xs text-brand-foreground">Default</span>}
              {a.line1}, {a.city}
            </div>
          )) ?? <p className="text-sm text-slate-500">No addresses saved yet.</p>}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Orders</h2>
        <Button asChild>
          <Link href="/orders">View order history</Link>
        </Button>
      </section>
    </div>
  );
}
