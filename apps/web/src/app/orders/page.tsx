"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { formatINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type OrderSummary = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  grandTotal: string | number;
  deliveryDate: string;
  deliverySlotId: string;
  scheduledDeliveryAt: string;
  deliveryWindowLabel?: string | null;
};

type OrderPage = {
  data: OrderSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

const PAGE_SIZE = 10;

export default function OrdersPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [page, setPage] = useState(1);
  const orders = useQuery({
    queryKey: ["orders", page],
    queryFn: () => api<OrderPage>(`/api/v1/orders?page=${page}&limit=${PAGE_SIZE}`),
    enabled: !!session,
  });

  if (sessionPending) return <p className="py-12 text-center text-slate-600">Checking your session…</p>;
  if (!session) {
    return <p className="py-12 text-center">Please <Link href="/login" className="text-brand underline">log in</Link> to view orders.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Order history</h1>
          <p className="mt-1 text-sm text-slate-600">{orders.data?.pagination.total ?? 0} orders</p>
        </div>
      </div>

      {orders.isLoading && <p className="py-10 text-center text-slate-600">Loading your orders…</p>}
      {orders.isError && (
        <p role="alert" className="py-10 text-center text-red-700">
          {orders.error instanceof ApiError ? orders.error.message : "Unable to load your orders. Try again."}
        </p>
      )}
      {orders.data?.data.length === 0 && (
        <div className="border-y border-slate-200 py-14 text-center">
          <h2 className="text-lg font-semibold text-slate-900">No orders yet</h2>
          <p className="mt-1 text-sm text-slate-600">Your completed checkouts will appear here.</p>
          <Button asChild className="mt-4"><Link href="/">Start shopping</Link></Button>
        </div>
      )}

      {!!orders.data?.data.length && (
        <>
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {orders.data.data.map((order) => (
              <li key={order.id}>
                <Link href={`/orders/${order.id}`} className="block py-4 transition hover:bg-slate-50">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{order.orderNumber}</p>
                      <p className="mt-1 text-sm text-slate-600">Ordered {formatDate(order.createdAt)}</p>
                    </div>
                    <p className="font-semibold text-slate-900">{formatINR(Number(order.grandTotal))}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
                    <span>Order: <strong className="font-medium text-slate-900">{order.status.replaceAll("_", " ")}</strong></span>
                    <span>Payment: <strong className="font-medium text-slate-900">{order.paymentStatus.replaceAll("_", " ")}</strong></span>
                    <span>Delivery: {order.deliveryWindowLabel ?? `${order.deliveryDate} · ${order.deliverySlotId}`}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-slate-600">
              Page {orders.data?.pagination.page ?? page} of {Math.max(orders.data?.pagination.totalPages ?? 1, 1)}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || orders.isFetching} onClick={() => setPage((value) => value - 1)}>
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= (orders.data?.pagination.totalPages ?? 1) || orders.isFetching}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
