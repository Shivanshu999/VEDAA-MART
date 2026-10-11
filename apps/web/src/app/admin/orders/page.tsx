"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { formatINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type StaffOrderSummary = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  grandTotal: string | number;
  deliverySlotId: string;
  deliveryDate: string;
  scheduledDeliveryAt: string;
  deliveryWindowLabel: string | null;
  itemCount: number;
  store: { id: string; name: string };
};

type StaffOrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotal: string | number;
  discountTotal: string | number;
  deliveryFee: string | number;
  handlingFee: string | number;
  taxTotal: string | number;
  grandTotal: string | number;
  store: { id: string; name: string };
  customerName: string | null;
  address: {
    recipientName?: string | null;
    phone?: string | null;
    label?: string | null;
    line1: string;
    line2?: string | null;
    landmark?: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  items: {
    id: string;
    productName: string;
    productSku: string;
    brand: string | null;
    packageSize: string | null;
    quantity: number;
    unitSellingPrice: string | number;
    lineTotal: string | number;
  }[];
  delivery: {
    slotId: string;
    deliveryDate: string;
    scheduledAt: string;
    deliveryWindowLabel: string | null;
  };
  allowedNextStatuses: string[];
};

type StaffOrderPage = {
  data: StaffOrderSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  stores: { id: string; name: string }[];
};

const statuses = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

export default function AdminOrdersPage() {
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [status, setStatus] = useState("");
  const [storeId, setStoreId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");

  const orders = useQuery({
    queryKey: ["staff-orders", status, storeId],
    queryFn: () => {
      const search = new URLSearchParams({ page: "1", limit: "30" });
      if (status) search.set("status", status);
      if (storeId) search.set("storeId", storeId);
      return api<StaffOrderPage>(`/api/v1/staff/orders?${search.toString()}`);
    },
    enabled: !!session,
  });
  const detail = useQuery({
    queryKey: ["staff-order", selectedOrderId, storeId],
    queryFn: () => {
      const query = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
      return api<{ data: StaffOrderDetail }>(`/api/v1/staff/orders/${selectedOrderId}${query}`);
    },
    enabled: !!session && !!selectedOrderId,
  });
  const transition = useMutation({
    mutationFn: (nextStatus: string) => api(`/api/v1/staff/orders/${selectedOrderId}/status`, {
      method: "PATCH",
      json: {
        status: nextStatus,
        expectedStatus: detail.data!.data.status,
        ...(storeId ? { storeId } : {}),
      },
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["staff-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["staff-order", selectedOrderId] }),
      ]);
    },
  });

  if (sessionPending) return <p className="py-10 text-center text-slate-600">Checking staff session…</p>;
  if (!session) return <p className="py-10 text-center">Staff sign-in required.</p>;
  const role = (session.user as { role?: string }).role;
  if (!role || !["ADMIN", "STORE_MANAGER", "STORE_STAFF"].includes(role)) {
    return <p className="py-10 text-center text-red-700">You do not have permission to manage orders.</p>;
  }

  const selectedOrder = detail.data?.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Store orders</h1>
          <p className="mt-1 text-sm text-slate-600">{orders.data?.pagination.total ?? 0} matching orders</p>
        </div>
        <Button variant="outline" disabled={orders.isFetching} onClick={() => orders.refetch()}>
          {orders.isFetching ? "Refreshing…" : "Refresh orders"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 border-y border-slate-200 py-3">
        {orders.data && orders.data.stores.length > 1 && (
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Store
            <select value={storeId} onChange={(event) => { setStoreId(event.target.value); setSelectedOrderId(""); }} className="h-9 min-w-48 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900">
              <option value="">All authorized stores</option>
              {orders.data.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
        )}
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          Order status
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 min-w-48 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900">
            <option value="">All statuses</option>
            {statuses.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
          </select>
        </label>
      </div>

      {orders.isLoading && <p className="py-10 text-center text-slate-600">Loading store orders…</p>}
      {orders.isError && <p role="alert" className="py-8 text-center text-red-700">Unable to load authorized store orders. Check your store access and try again.</p>}
      {orders.data?.data.length === 0 && <p className="py-10 text-center text-slate-600">No orders match this filter.</p>}

      {!!orders.data?.data.length && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {orders.data.data.map((order) => (
              <li key={order.id}>
                <button type="button" onClick={() => setSelectedOrderId(order.id)} className={`block w-full px-2 py-4 text-left transition hover:bg-slate-50 ${selectedOrderId === order.id ? "bg-emerald-50" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="font-semibold text-slate-900">{order.orderNumber}</span>
                    <span className="text-sm font-medium text-slate-700">{order.status.replaceAll("_", " ")}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span>{order.store.name}</span>
                    <span>{order.itemCount} items</span>
                    <span>{formatINR(Number(order.grandTotal))}</span>
                    <span>Payment: {order.paymentStatus.replaceAll("_", " ")}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{order.deliveryDate} · {formatTime(order.scheduledDeliveryAt)} · {order.deliveryWindowLabel ?? order.deliverySlotId}</p>
                </button>
              </li>
            ))}
          </ul>

          <aside className="min-w-0">
            {!selectedOrderId && <p className="py-10 text-center text-sm text-slate-500">Select an order to view its items and delivery details.</p>}
            {detail.isLoading && <p className="py-10 text-center text-slate-600">Loading order details…</p>}
            {detail.isError && <p role="alert" className="py-8 text-center text-sm text-red-700">Unable to load this order. It may not belong to an authorized store.</p>}
            {selectedOrder && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{selectedOrder.orderNumber}</h2>
                  <p className="text-sm text-slate-600">{selectedOrder.customerName ?? "Customer"} · {selectedOrder.store.name}</p>
                  <p className="mt-1 text-sm">Order {selectedOrder.status.replaceAll("_", " ")} · Payment {selectedOrder.paymentStatus.replaceAll("_", " ")}</p>
                </div>
                <section className="border-t border-slate-200 pt-3">
                  <h3 className="text-sm font-semibold text-slate-900">Items</h3>
                  <ul className="mt-2 divide-y divide-slate-100">
                    {selectedOrder.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-3 py-2 text-sm">
                        <span>{item.productName}<span className="block text-xs text-slate-500">{item.brand ?? item.productSku} · Qty {item.quantity} · {formatINR(Number(item.unitSellingPrice))} each</span></span>
                        <span className="shrink-0">{formatINR(Number(item.lineTotal))}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-3 space-y-1 text-sm">
                    <SummaryRow label="Subtotal" value={selectedOrder.subtotal} />
                    <SummaryRow label="Discount" value={-Number(selectedOrder.discountTotal)} />
                    <SummaryRow label="Delivery" value={selectedOrder.deliveryFee} />
                    <SummaryRow label="Tax" value={selectedOrder.taxTotal} />
                    <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold"><dt>Total</dt><dd>{formatINR(Number(selectedOrder.grandTotal))}</dd></div>
                  </dl>
                </section>
                <section className="border-t border-slate-200 pt-3 text-sm">
                  <h3 className="font-semibold text-slate-900">Delivery</h3>
                  <p className="mt-1">{selectedOrder.delivery.deliveryWindowLabel ?? selectedOrder.delivery.slotId}</p>
                  <p className="text-slate-600">{selectedOrder.delivery.deliveryDate} · {formatTime(selectedOrder.delivery.scheduledAt)}</p>
                  <p className="mt-2">{selectedOrder.address.line1}{selectedOrder.address.line2 ? `, ${selectedOrder.address.line2}` : ""}, {selectedOrder.address.city}, {selectedOrder.address.state} {selectedOrder.address.postalCode}</p>
                  {selectedOrder.address.phone && <p className="text-slate-600">{selectedOrder.address.phone}</p>}
                </section>
                <section className="border-t border-slate-200 pt-3">
                  <h3 className="text-sm font-semibold text-slate-900">Update order</h3>
                  {selectedOrder.allowedNextStatuses.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedOrder.allowedNextStatuses.map((nextStatus) => (
                        <Button key={nextStatus} size="sm" disabled={transition.isPending} onClick={() => transition.mutate(nextStatus)}>
                          {transition.isPending ? "Updating…" : `Move to ${nextStatus.replaceAll("_", " ")}`}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-slate-600">
                      {selectedOrder.paymentStatus !== "CAPTURED"
                        ? "Staff processing is unavailable until payment is captured. Payment state is not changed here."
                        : "No further staff transitions are available."}
                    </p>
                  )}
                  {transition.isError && <p role="alert" className="mt-2 text-sm text-red-700">{transition.error instanceof Error ? transition.error.message : "Status update failed. Refresh and retry."}</p>}
                </section>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return <div className="flex justify-between text-slate-600"><dt>{label}</dt><dd>{formatINR(Number(value))}</dd></div>;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value));
}
