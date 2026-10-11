"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ApiError, api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/utils";

type Address = {
  id: string;
  label: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
  isServiceable: boolean;
};

type CheckoutPreview = {
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitSellingPrice: number;
    lineTotal: number;
  }[];
  totals: {
    subtotal: number;
    discountTotal: number;
    deliveryFee: number;
    handlingFee: number;
    taxTotal: number;
    grandTotal: number;
  };
  delivery: {
    slotId: string;
    deliveryDate: string;
    deliveryTime: string;
    scheduledDeliveryAt: string;
    label: string;
    timezone: string;
  };
};

type CartData = {
  items: {
    productId: string;
    quantity: number;
    product: { name: string; slug: string; image: string | null };
  }[];
};

export default function CheckoutPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [coupon, setCoupon] = useState("");
  const [addressForm, setAddressForm] = useState({
    line1: "",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "",
  });
  const idempotencyKey = useRef<string | null>(null);

  const cart = useQuery({
    queryKey: ["cart"],
    queryFn: () => api<{ data: CartData }>("/api/v1/cart"),
    enabled: !!session,
  });
  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api<{ data: Address[] }>("/api/v1/addresses"),
    enabled: !!session,
  });

  const eligibleAddresses = addresses.data?.data.filter((address) => address.isServiceable) ?? [];
  const selectedAddress =
    eligibleAddresses.find((address) => address.id === selectedAddressId) ??
    eligibleAddresses.find((address) => address.isDefault) ??
    eligibleAddresses[0];

  const preview = useQuery({
    queryKey: ["checkout-preview", selectedAddress?.id, coupon],
    queryFn: async () => {
      const response = await api<{ data: CheckoutPreview }>("/api/v1/orders/preview", {
        method: "POST",
        json: {
          addressId: selectedAddress!.id,
          couponCode: coupon || undefined,
        },
      });
      return response.data;
    },
    enabled: !!session && !!selectedAddress && (cart.data?.data.items.length ?? 0) > 0,
    retry: false,
  });

  const saveAddress = useMutation({
    mutationFn: () =>
      api<{ data: Address }>("/api/v1/addresses", {
        method: "POST",
        json: { ...addressForm, label: "Home", isDefault: true },
      }),
    onSuccess: async ({ data }) => {
      setSelectedAddressId(data.id);
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
  });

  const placeOrder = useMutation({
    mutationFn: async () => {
      if (!selectedAddress) throw new Error("Choose a serviceable delivery address.");
      idempotencyKey.current ??= crypto.randomUUID();
      return api<{ data: { id: string }; delivery: CheckoutPreview["delivery"] }>("/api/v1/orders", {
        method: "POST",
        json: {
          addressId: selectedAddress.id,
          couponCode: coupon || undefined,
          idempotencyKey: idempotencyKey.current,
        },
      });
    },
    onSuccess: async ({ data }) => {
      idempotencyKey.current = null;
      await queryClient.invalidateQueries({ queryKey: ["cart"] });
      router.push(`/orders/${data.id}`);
    },
  });

  if (sessionPending) return <p className="py-12 text-center text-slate-600">Checking your session…</p>;
  if (!session) {
    return (
      <p className="py-12 text-center">
        Please <Link href="/login" className="text-brand underline">log in</Link> to checkout.
      </p>
    );
  }
  if (cart.isLoading || addresses.isLoading) {
    return <p className="py-12 text-center text-slate-600">Loading checkout…</p>;
  }
  if (cart.isError || addresses.isError) {
    return <p role="alert" className="py-12 text-center text-red-700">Unable to load your checkout details. Refresh and try again.</p>;
  }
  if (!cart.data?.data.items.length) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Your cart is empty</h1>
        <Button asChild className="mt-5"><Link href="/">Continue shopping</Link></Button>
      </div>
    );
  }

  const errorMessage = getCheckoutError(placeOrder.error ?? preview.error);
  const previewReady = !!preview.data && !preview.isFetching;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 p-5">
          <h1 className="text-xl font-semibold text-slate-900">Checkout</h1>
          {eligibleAddresses.length > 0 ? (
            <div className="mt-4 space-y-2">
              <Label htmlFor="delivery-address">Delivery address</Label>
              <select
                id="delivery-address"
                value={selectedAddress?.id ?? ""}
                disabled={placeOrder.isPending}
                onChange={(event) => {
                  setSelectedAddressId(event.target.value);
                  idempotencyKey.current = null;
                  placeOrder.reset();
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {eligibleAddresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {address.label}: {address.line1}, {address.city} {address.postalCode}
                  </option>
                ))}
              </select>
              {selectedAddress && (
                <p className="text-sm text-slate-600">
                  {selectedAddress.line1}{selectedAddress.line2 ? `, ${selectedAddress.line2}` : ""}, {selectedAddress.city}, {selectedAddress.state} {selectedAddress.postalCode}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-600">Add a serviceable address to continue.</p>
              <div>
                <Label htmlFor="line1">Address line</Label>
                <Input id="line1" value={addressForm.line1} onChange={(event) => setAddressForm({ ...addressForm, line1: event.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={addressForm.city} onChange={(event) => setAddressForm({ ...addressForm, city: event.target.value })} />
                </div>
                <div>
                  <Label htmlFor="postal">Postal code</Label>
                  <Input id="postal" value={addressForm.postalCode} onChange={(event) => setAddressForm({ ...addressForm, postalCode: event.target.value })} />
                </div>
              </div>
              <Button variant="outline" disabled={saveAddress.isPending} onClick={() => saveAddress.mutate()}>
                {saveAddress.isPending ? "Saving…" : "Save address"}
              </Button>
              {saveAddress.isError && <p role="alert" className="text-sm text-red-700">{getCheckoutError(saveAddress.error)}</p>}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900">Scheduled delivery</h2>
          {preview.isLoading ? (
            <p className="mt-2 text-sm text-slate-600">Checking available delivery time…</p>
          ) : preview.data ? (
            <div className="mt-2">
              <p className="text-sm font-medium text-brand-foreground">{preview.data.delivery.label}</p>
              <p className="text-xs text-slate-500">
                {preview.data.delivery.deliveryDate} · {preview.data.delivery.deliveryTime} ({preview.data.delivery.timezone})
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">Select an eligible address to see the delivery time.</p>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900">Your items</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {(preview.data?.items ?? []).map((item) => {
              const cartItem = cart.data!.data.items.find((entry) => entry.productId === item.productId);
              return (
                <li key={item.productId} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {cartItem?.product.image && (
                      <Image
                        src={cartItem.product.image}
                        alt=""
                        width={48}
                        height={48}
                        sizes="48px"
                        className="h-12 w-12 rounded-md object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{item.productName}</p>
                      <p className="text-xs text-slate-500">Qty {item.quantity} · {formatINR(item.unitSellingPrice)} each</p>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-medium">{formatINR(item.lineTotal)}</p>
                </li>
              );
            })}
            {!preview.data && cart.data.data.items.map((item) => (
              <li key={item.productId} className="flex justify-between py-3 text-sm">
                <span>{item.product.name} · Qty {item.quantity}</span>
                <span>Price checking…</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 max-w-xs space-y-2">
            <Label htmlFor="coupon">Coupon code</Label>
            <Input
              id="coupon"
              value={coupon}
              disabled={placeOrder.isPending}
              onChange={(event) => {
                setCoupon(event.target.value.trim().toUpperCase());
                idempotencyKey.current = null;
                placeOrder.reset();
              }}
              placeholder="Enter code"
            />
          </div>
        </section>
      </div>

      <aside className="h-fit rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900">Order total</h2>
        {preview.data ? (
          <dl className="mt-4 space-y-2 text-sm">
            <SummaryRow label="Subtotal" value={preview.data.totals.subtotal} />
            <SummaryRow label="Discount" value={-preview.data.totals.discountTotal} />
            <SummaryRow label="Delivery" value={preview.data.totals.deliveryFee} />
            <SummaryRow label="Handling" value={preview.data.totals.handlingFee} />
            <SummaryRow label="Tax" value={preview.data.totals.taxTotal} />
            <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-semibold">
              <dt>Total</dt><dd>{formatINR(preview.data.totals.grandTotal)}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-slate-600">The server will calculate your total after you select an address.</p>
        )}
        <p className="mt-4 text-xs text-slate-600">
          Your order is created first. Continue to its details to start secure payment.
        </p>
        {errorMessage && <p role="alert" className="mt-4 text-sm text-red-700">{errorMessage}</p>}
        <Button
          className="mt-4 w-full"
          disabled={!selectedAddress || !previewReady || !cart.data.data.items.length || placeOrder.isPending}
          onClick={() => placeOrder.mutate()}
        >
          {placeOrder.isPending ? "Creating order…" : "Place order"}
        </Button>
        {preview.isFetching && <p className="mt-2 text-center text-xs text-slate-500">Refreshing server prices…</p>}
      </aside>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between text-slate-600"><dt>{label}</dt><dd>{formatINR(value)}</dd></div>;
}

function getCheckoutError(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session expired. Log in again to continue.";
    if (error.status === 409) return "Stock or cart details changed. Review your cart and try again.";
    if (error.status === 400 || error.status === 404) return error.message;
  }
  return "Checkout could not be completed. Please try again.";
}