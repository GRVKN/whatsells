import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIncrementalRefundSnapshot,
  buildOrderFinancialSnapshot,
  calculateOrderReconciliation,
  getRefundPayloadAmountCents,
  parseMoneyToCents,
} from "../app/order-reconciliation.js";

function makeOrder({
  total = "100.00",
  refunded = "0.00",
  currency = "EUR",
  cancelledAt = null,
} = {}) {
  return {
    cancelledAt,
    totalPriceSet: {
      shopMoney: {
        amount: total,
        currencyCode: currency,
      },
    },
    totalRefundedSet: {
      shopMoney: {
        amount: refunded,
        currencyCode: currency,
      },
    },
  };
}

test("parses Shopify money without floating-point cents drift", () => {
  assert.equal(parseMoneyToCents("19.99"), 1_999);
  assert.equal(parseMoneyToCents("19,99"), 1_999);
});

test("partial refunds reduce net attributed revenue but keep the order", () => {
  const next = buildOrderFinancialSnapshot(
    makeOrder({ total: "100.00", refunded: "25.00", currency: "USD" }),
  );

  assert.deepEqual(next, {
    originalValueCents: 10_000,
    refundedCents: 2_500,
    valueCents: 7_500,
    isCancelled: false,
    currency: "USD",
  });

  assert.deepEqual(
    calculateOrderReconciliation(
      {
        valueCents: 10_000,
        refundedCents: 0,
        isCancelled: false,
      },
      next,
    ),
    {
      revenueDeltaCents: -2_500,
      refundedDeltaCents: 2_500,
      ordersDelta: 0,
      cancelledOrdersDelta: 0,
    },
  );
});

test("cancelled orders become zero-value and leave the active order count", () => {
  const next = buildOrderFinancialSnapshot(
    makeOrder({
      total: "100.00",
      refunded: "100.00",
      cancelledAt: "2026-07-28T10:00:00Z",
    }),
  );

  assert.deepEqual(
    calculateOrderReconciliation(
      {
        valueCents: 10_000,
        refundedCents: 0,
        isCancelled: false,
      },
      next,
    ),
    {
      revenueDeltaCents: -10_000,
      refundedDeltaCents: 10_000,
      ordersDelta: -1,
      cancelledOrdersDelta: 1,
    },
  );
});

test("repeated reconciliation is idempotent", () => {
  const snapshot = buildOrderFinancialSnapshot(
    makeOrder({ total: "100.00", refunded: "25.00" }),
  );

  assert.deepEqual(calculateOrderReconciliation(snapshot, snapshot), {
    revenueDeltaCents: 0,
    refundedDeltaCents: 0,
    ordersDelta: 0,
    cancelledOrdersDelta: 0,
  });
});

test("refund webhook fallback sums only successful refund transactions", () => {
  assert.equal(
    getRefundPayloadAmountCents({
      transactions: [
        { kind: "refund", status: "success", amount: "25.00" },
        { kind: "refund", status: "failure", amount: "90.00" },
        { kind: "sale", status: "success", amount: "50.00" },
        { status: "success", amount: "5.00" },
      ],
    }),
    3_000,
  );
});

test("incremental refund fallback never reduces net value below zero", () => {
  const next = buildIncrementalRefundSnapshot(
    {
      originalValueCents: 10_000,
      valueCents: 2_000,
      refundedCents: 8_000,
      currency: "EUR",
      isCancelled: false,
    },
    5_000,
  );

  assert.deepEqual(next, {
    originalValueCents: 10_000,
    refundedCents: 10_000,
    valueCents: 0,
    currency: "EUR",
    isCancelled: false,
  });
});
