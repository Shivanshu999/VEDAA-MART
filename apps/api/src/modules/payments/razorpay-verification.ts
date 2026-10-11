import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@vedaa/shared";

export type RazorpayPaymentSnapshot = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
  method?: string;
};

export function verifyCheckoutSignature(input: {
  storedProviderOrderId: string;
  providerPaymentId: string;
  signature: string;
  secret: string;
}): boolean {
  if (!/^[a-f\d]{64}$/i.test(input.signature)) return false;
  const expected = createHmac("sha256", input.secret)
    .update(`${input.storedProviderOrderId}|${input.providerPaymentId}`)
    .digest();
  const supplied = Buffer.from(input.signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function assertCapturedPaymentMatches(input: {
  payment: RazorpayPaymentSnapshot;
  expectedPaymentId: string;
  expectedProviderOrderId: string;
  expectedAmount: number;
  expectedCurrency: string;
}): void {
  const { payment } = input;
  if (
    payment.id !== input.expectedPaymentId ||
    payment.order_id !== input.expectedProviderOrderId ||
    payment.amount !== input.expectedAmount ||
    payment.currency !== input.expectedCurrency
  ) {
    throw new AppError("Gateway payment does not match this order", "PAYMENT_MISMATCH", 409);
  }
  if (payment.status !== "captured" || payment.captured !== true) {
    throw new AppError("Payment is not captured", "PAYMENT_NOT_CAPTURED", 409);
  }
}

export function amountToMinorUnits(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("Order amount is invalid", "PAYMENT_AMOUNT_INVALID", 409);
  }
  const minorUnits = Math.round(amount * 100);
  if (Math.abs(amount * 100 - minorUnits) > 0.000001) {
    throw new AppError("Order amount has unsupported precision", "PAYMENT_AMOUNT_INVALID", 409);
  }
  return minorUnits;
}
