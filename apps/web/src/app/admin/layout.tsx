"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";

const links = [
  ["/admin", "Overview"],
  ["/admin/orders", "Orders"],
  ["/admin/products", "Products"],
  ["/admin/categories", "Categories"],
  ["/admin/inventory", "Inventory"],
  ["/admin/delivery-schedule", "Delivery schedule"],
  ["/admin/customers", "Customers"],
  ["/admin/coupons", "Coupons"],
  ["/admin/settings", "Settings"],
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = authClient.useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session) {
    return <p className="p-6">Admin login required.</p>;
  }
  if (!role || !["ADMIN", "STORE_MANAGER", "STORE_STAFF"].includes(role)) {
    return <p className="p-6">You do not have access to the admin dashboard.</p>;
  }

  return (
    <div className="grid min-h-[70vh] gap-6 md:grid-cols-[220px_1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-900">Vedaa Admin</p>
        <nav className="flex flex-col gap-1 text-sm">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-md px-2 py-1.5 hover:bg-white">
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div>{children}</div>
    </div>
  );
}
