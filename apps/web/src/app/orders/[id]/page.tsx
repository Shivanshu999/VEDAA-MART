"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { formatINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type RazorpayCheckoutResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayCheckoutResponse) => void;
  modal: { ondismiss: () => void };
};

type RazorpayFailure = { error?: { metadata?: { payment_id?: string } } };

type RazorpayCheckout = {
  open: () => void;
  on: (event: "payment.failed", listener: (response: RazorpayFailure) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckout;
  }
}

type PaymentFlowResult =
  | { kind: "verified"; reconciliationRequired: boolean }
  | { kind: "failed" }
  | { kind: "dismissed" };

let checkoutScriptPromise: Promise<void> | null = null;

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;
  checkoutScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => window.Razorpay ? resolve() : reject(new Error("Razorpay Checkout did not load."));
    script.onerror = () => {
      checkoutScriptPromise = null;
      reject(new Error("Unable to load Razorpay Checkout."));
    };
    document.head.appendChild(script);
  });
  return checkoutScriptPromise;
}

type OrderDetail = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  currency: string;
  subtotal: string | number;
  discountTotal: string | number;
  deliveryFee: string | number;
  handlingFee: string | number;
  taxTotal: string | number;
  grandTotal: string | number;
  deliverySlotId: string;
  deliveryDate: string;
  scheduledDeliveryAt: string;
  deliveryWindowLabel?: string | null;
  addressSnapshotAvailable: boolean;
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
    unitMrp: string | number;
    unitSellingPrice: string | number;
    lineTotal: string | number;
  }[];
  payment: { status: string; amount: string | number; currency: string; method: string | null } | null;
  delivery: { slotId: string; deliveryDate: string; scheduledAt: string; deliveryWindowLabel?: string | null; timezone: string };
  canCancel: boolean;
  cancelledAt: string | null;
  cancellationReason: string | null;
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const paymentIdempotencyKey = useRef<string | null>(null);
  const order = useQuery({
    queryKey: ["order", params.id],
    queryFn: () => api<{ data: OrderDetail }>(`/api/v1/orders/${params.id}`),
    enabled: !!session,
  });

  const cancel = useMutation({
    mutationFn: () => api(`/api/v1/orders/${params.id}/cancel`, { method: "POST", json: {} }),
    onSuccess: async () => {
      setConfirmCancel(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["order", params.id] }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
      ]);
    },
  });

  const pay = useMutation({
    mutationFn: async () => {
      paymentIdempotencyKey.current ??= crypto.randomUUID();
      const initialized = await api<{
        data: { attemptId: string; providerOrderId: string; amount: number; currency: string; keyId: string };
      }>("/api/v1/payments/create-order", {
        method: "POST",
        json: { orderId: params.id, idempotencyKey: paymentIdempotencyKey.current },
      });
      await loadRazorpayCheckout();
      if (!window.Razorpay) throw new Error("Razorpay Checkout is unavailable.");

      return new Promise<PaymentFlowResult>((resolve, reject) => {
        let settled = false;
        const finish = (result: PaymentFlowResult) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        const checkout = new window.Razorpay!({
          key: initialized.data.keyId,
          amount: initialized.data.amount,
          currency: initialized.data.currency,
          name: "Vedaa Mart",
          description: `Payment for ${o!.orderNumber}`,
          order_id: initialized.data.providerOrderId,
          handler: (response) => {
            void api<{ data: { reconciliationRequired: boolean } }>("/api/v1/payments/verify", {
              method: "POST",
              json: {
                orderId: params.id,
                attemptId: initialized.data.attemptId,
                providerOrderId: response.razorpay_order_id,
                providerPaymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              },
            }).then(({ data }) => finish({ kind: "verified", reconciliationRequired: data.reconciliationRequired }))
              .catch(reject);
          },
          modal: { ondismiss: () => finish({ kind: "dismissed" }) },
        });
        checkout.on("payment.failed", (response) => {
          const providerPaymentId = response.error?.metadata?.payment_id;
          if (!providerPaymentId) {
            finish({ kind: "failed" });
            return;
          }
          void api("/api/v1/payments/failed", {
            method: "POST",
            json: {
              orderId: params.id,
              attemptId: initialized.data.attemptId,
              providerOrderId: initialized.data.providerOrderId,
              providerPaymentId,
            },
          }).then(() => finish({ kind: "failed" })).catch(reject);
        });
        checkout.open();
      });
    },
    onSuccess: async (result) => {
      if (result.kind === "verified") {
        paymentIdempotencyKey.current = null;
        setPaymentMessage(result.reconciliationRequired
          ? "The gateway confirmed payment, but this order needs reconciliation. It has not been reopened or released for processing."
          : "Payment verified by the server. Your order is confirmed.");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["order", params.id] }),
          queryClient.invalidateQueries({ queryKey: ["orders"] }),
        ]);
      } else if (result.kind === "failed") {
        paymentIdempotencyKey.current = null;
        setPaymentMessage("The payment failed. You can start another attempt.");
        await queryClient.invalidateQueries({ queryKey: ["order", params.id] });
      } else {
        setPaymentMessage("Payment window closed. No payment was confirmed.");
      }
    },
  });

  const o = order.data?.data;
  if (sessionPending) return <p className="py-12 text-center text-slate-600">Checking your session…</p>;
  if (!session) return <p className="py-12 text-center">Please <Link href="/login" className="text-brand underline">log in</Link> to view this order.</p>;
  if (order.isLoading) return <p className="py-12 text-center text-slate-600">Loading order…</p>;
  if (order.isError || !o) {
    return (
      <div className="py-12 text-center">
        <p role="alert" className="text-red-700">
          {order.error instanceof ApiError && order.error.status === 404
            ? "This order could not be found."
            : order.error instanceof ApiError
              ? order.error.message
              : "Unable to load this order. Try again."}
        </p>
        <Button asChild variant="outline" className="mt-4"><Link href="/orders">Back to orders</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/orders" className="text-sm text-brand hover:underline">← Order history</Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{o.orderNumber}</h1>
          <p className="mt-1 text-sm text-slate-600">Placed {formatDate(o.createdAt)}</p>
        </div>
        <div className="text-sm sm:text-right">
          <p>Order status: <strong className="font-semibold text-slate-900">{o.status.replaceAll("_", " ")}</strong></p>
          <p className="mt-1">Payment status: <strong className="font-semibold text-slate-900">{o.paymentStatus.replaceAll("_", " ")}</strong></p>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold">Scheduled delivery</h2>
        <p className="mt-2 text-sm text-slate-800">{o.delivery.deliveryWindowLabel ?? o.deliveryWindowLabel}</p>
        <p className="mt-1 text-sm text-slate-600">
          {o.delivery.deliveryDate} · {formatTime(o.delivery.scheduledAt)} ({o.delivery.timezone})
        </p>
        <p className="text-xs text-slate-500">Slot: {o.delivery.slotId}</p>
      </section>

      <section className="rounded-xl border border-slate-200 p-5">
        <h2 className="mb-3 font-semibold">Items</h2>
        <ul className="divide-y divide-slate-100">
          {o.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 py-3 text-sm">
              <span className="text-slate-800">
                <strong className="font-medium">{item.productName}</strong>
                {item.brand ? ` · ${item.brand}` : ""}
                <span className="block text-xs text-slate-500">
                  {item.packageSize ? `${item.packageSize} · ` : ""}Qty {item.quantity} × {formatINR(Number(item.unitSellingPrice))}
                </span>
              </span>
              <span className="shrink-0 font-medium">{formatINR(Number(item.lineTotal))}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm">
          <SummaryRow label="Subtotal" value={o.subtotal} />
          <SummaryRow label="Discount" value={-Number(o.discountTotal)} />
          <SummaryRow label="Delivery" value={o.deliveryFee} />
          <SummaryRow label="Handling" value={o.handlingFee} />
          <SummaryRow label="Tax" value={o.taxTotal} />
          <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-900">
            <dt>Total</dt><dd>{formatINR(Number(o.grandTotal))}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 p-5 text-sm">
        <h2 className="font-semibold">Delivery address{ o.address.label ? ` · ${o.address.label}` : ""}</h2>
        <p>
          {o.address.recipientName && <>{o.address.recipientName}<br /></>}
          {o.address.line1}{o.address.line2 ? `, ${o.address.line2}` : ""}
          {o.address.landmark ? `, ${o.address.landmark}` : ""}<br />
          {o.address.city}, {o.address.state} {o.address.postalCode}, {o.address.country}
        </p>
        {!o.addressSnapshotAvailable && <p className="mt-2 text-xs text-amber-700">This older order has no saved address snapshot; the displayed address is the current saved address.</p>}
      </section>

      {o.payment && <p className="text-sm text-slate-600">Payment record: {o.payment.status.replaceAll("_", " ")}{o.payment.method ? ` · ${o.payment.method}` : ""}</p>}
      {o.status === "PENDING" && ["PENDING", "FAILED"].includes(o.paymentStatus) && (
        <section className="rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900">Payment</h2>
          <p className="mt-1 text-sm text-slate-600">Pay {formatINR(Number(o.grandTotal))}. The server verifies capture before confirming the order.</p>
          <Button className="mt-3" disabled={pay.isPending} onClick={() => { setPaymentMessage(""); pay.mutate(); }}>
            {pay.isPending ? "Opening secure checkout…" : `Pay ${formatINR(Number(o.grandTotal))}`}
          </Button>
          {paymentMessage && <p role="status" className="mt-2 text-sm text-slate-700">{paymentMessage}</p>}
          {pay.isError && <p role="alert" className="mt-2 text-sm text-red-700">{pay.error instanceof ApiError ? pay.error.message : pay.error instanceof Error ? pay.error.message : "Payment could not be started. Try again."}</p>}
        </section>
      )}
      {o.cancelledAt && <p className="text-sm text-slate-600">Cancelled {formatDate(o.cancelledAt)}{o.cancellationReason ? ` · ${o.cancellationReason}` : ""}</p>}

      {o.canCancel && !confirmCancel && (
        <Button variant="destructive" onClick={() => setConfirmCancel(true)}>
          Cancel order
        </Button>
      )}
      {o.canCancel && confirmCancel && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4" aria-live="polite">
          <p className="text-sm font-medium text-red-900">Cancel this order?</p>
          <p className="mt-1 text-sm text-red-800">Reserved items will be returned to available stock. No payment refund will be issued by this action.</p>
          {cancel.isError && <p role="alert" className="mt-2 text-sm text-red-800">{getErrorMessage(cancel.error)}</p>}
          <div className="mt-3 flex gap-2">
            <Button variant="destructive" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              {cancel.isPending ? "Cancelling…" : "Confirm cancellation"}
            </Button>
            <Button variant="outline" disabled={cancel.isPending} onClick={() => setConfirmCancel(false)}>Keep order</Button>
          </div>
        </section>
      )}
      {!o.canCancel && o.status !== "CANCELLED" && (
        <p className="text-sm text-slate-600">This order can no longer be cancelled online.</p>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return <div className="flex justify-between text-slate-600"><dt>{label}</dt><dd>{formatINR(Number(value))}</dd></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return "Cancellation could not be completed. Please refresh and try again.";
}
