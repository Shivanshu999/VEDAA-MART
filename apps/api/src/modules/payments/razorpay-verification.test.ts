import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  amountToMinorUnits,
  assertCapturedPaymentMatches,
  verifyCheckoutSignature,
} from "./razorpay-verification.js";

const secret = "unit-test-secret-only";
const orderId = "order_server_stored";
const paymentId = "pay_test_capture";
const signature = createHmac("sha256", secret)
  .update(`${orderId}|${paymentId}`)
  .digest("hex");

const capturedPayment = {
  id: paymentId,
  order_id: orderId,
  amount: 12345,
  currency: "INR",
  status: "captured",
  captured: true,
  method: "upi",
};

describe("Razorpay server verification helpers", () => {
  it("validates the signature against the stored gateway order ID", () => {
    expect(verifyCheckoutSignature({
      storedProviderOrderId: orderId,
      providerPaymentId: paymentId,
      signature,
      secret,
    })).toBe(true);
    expect(verifyCheckoutSignature({
      storedProviderOrderId: "order_from_untrusted_client",
      providerPaymentId: paymentId,
      signature,
      secret,
    })).toBe(false);
    expect(verifyCheckoutSignature({
      storedProviderOrderId: orderId,
      providerPaymentId: paymentId,
      signature: "bad",
      secret,
    })).toBe(false);
  });

  it("requires the fetched payment to match ID, order, amount, and currency", () => {
    expect(() => assertCapturedPaymentMatches({
      payment: capturedPayment,
      expectedPaymentId: paymentId,
      expectedProviderOrderId: orderId,
      expectedAmount: 12345,
      expectedCurrency: "INR",
    })).not.toThrow();
    expect(() => assertCapturedPaymentMatches({
      payment: capturedPayment,
      expectedPaymentId: paymentId,
      expectedProviderOrderId: orderId,
      expectedAmount: 1,
      expectedCurrency: "INR",
    })).toThrowError(expect.objectContaining({ code: "PAYMENT_MISMATCH" }));
  });

  it("requires authoritative gateway capture state", () => {
    expect(() => assertCapturedPaymentMatches({
      payment: { ...capturedPayment, status: "authorized", captured: false },
      expectedPaymentId: paymentId,
      expectedProviderOrderId: orderId,
      expectedAmount: 12345,
      expectedCurrency: "INR",
    })).toThrowError(expect.objectContaining({ code: "PAYMENT_NOT_CAPTURED" }));
  });

  it("converts INR amounts to paise without accepting fractions of a paise", () => {
    expect(amountToMinorUnits(123.45)).toBe(12345);
    expect(() => amountToMinorUnits(12.345)).toThrowError(
      expect.objectContaining({ code: "PAYMENT_AMOUNT_INVALID" }),
    );
  });
});
