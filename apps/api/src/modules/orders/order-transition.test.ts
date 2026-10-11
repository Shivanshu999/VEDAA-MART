import { describe, expect, it } from "vitest";
import { OrderStatus, PaymentStatus } from "@vedaa/database";
import { assertStaffOrderTransition, getAllowedStaffTransitions } from "./order-transition.service.js";

describe("staff order transitions", () => {
  it("allows only the next lifecycle transition for captured payments", () => {
    expect(getAllowedStaffTransitions(OrderStatus.CONFIRMED, PaymentStatus.CAPTURED))
      .toEqual([OrderStatus.PREPARING]);
    expect(() => assertStaffOrderTransition(
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      PaymentStatus.CAPTURED,
    )).not.toThrow();
  });

  it("blocks staff processing for pending or failed payments without changing payment state", () => {
    expect(getAllowedStaffTransitions(OrderStatus.PENDING, PaymentStatus.PENDING)).toEqual([]);
    expect(() => assertStaffOrderTransition(
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      PaymentStatus.PENDING,
    )).toThrowError(expect.objectContaining({ code: "ORDER_PAYMENT_REQUIRED" }));
  });

  it("rejects skipped lifecycle states", () => {
    expect(() => assertStaffOrderTransition(
      OrderStatus.CONFIRMED,
      OrderStatus.OUT_FOR_DELIVERY,
      PaymentStatus.CAPTURED,
    )).toThrowError(expect.objectContaining({ code: "INVALID_ORDER_TRANSITION" }));
  });

  it("keeps cancelled and delivered orders terminal", () => {
    expect(getAllowedStaffTransitions(OrderStatus.CANCELLED, PaymentStatus.CAPTURED)).toEqual([]);
    expect(getAllowedStaffTransitions(OrderStatus.DELIVERED, PaymentStatus.CAPTURED)).toEqual([]);
    expect(() => assertStaffOrderTransition(
      OrderStatus.CANCELLED,
      OrderStatus.CONFIRMED,
      PaymentStatus.CAPTURED,
    )).toThrowError(expect.objectContaining({ code: "INVALID_ORDER_TRANSITION" }));
  });
});