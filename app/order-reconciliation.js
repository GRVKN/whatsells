import { normalizeCurrencyCode } from "./money.js";

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function parseMoneyToCents(value) {
  const normalized = String(value ?? "0")
    .replace(",", ".")
    .trim();
  const number = Number(normalized);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Invalid Shopify money value: ${value}`);
  }

  return Math.round(number * 100);
}

export function buildOrderFinancialSnapshot(order) {
  const originalMoney = order?.totalPriceSet?.shopMoney;
  const refundedMoney = order?.totalRefundedSet?.shopMoney;

  const originalValueCents = parseMoneyToCents(originalMoney?.amount);
  const refundedCents = Math.min(
    parseMoneyToCents(refundedMoney?.amount),
    originalValueCents,
  );
  const isCancelled = Boolean(order?.cancelledAt);
  const valueCents = isCancelled
    ? 0
    : Math.max(originalValueCents - refundedCents, 0);

  return {
    originalValueCents,
    refundedCents,
    valueCents,
    isCancelled,
    currency: normalizeCurrencyCode(
      originalMoney?.currencyCode || refundedMoney?.currencyCode,
    ),
  };
}

export function calculateOrderReconciliation(previous, next) {
  const previousValueCents = numberOrZero(previous?.valueCents);
  const previousRefundedCents = numberOrZero(previous?.refundedCents);
  const previousIsCancelled = Boolean(previous?.isCancelled);

  const nextValueCents = numberOrZero(next?.valueCents);
  const nextRefundedCents = numberOrZero(next?.refundedCents);
  const nextIsCancelled = Boolean(next?.isCancelled);

  return {
    revenueDeltaCents: nextValueCents - previousValueCents,
    refundedDeltaCents: nextRefundedCents - previousRefundedCents,
    ordersDelta: Number(!nextIsCancelled) - Number(!previousIsCancelled),
    cancelledOrdersDelta: Number(nextIsCancelled) - Number(previousIsCancelled),
  };
}

export function getRefundPayloadAmountCents(payload) {
  const transactions = Array.isArray(payload?.transactions)
    ? payload.transactions
    : [];

  return transactions.reduce((sum, transaction) => {
    const status = String(transaction?.status || "")
      .trim()
      .toLowerCase();
    const kind = String(transaction?.kind || "")
      .trim()
      .toLowerCase();

    if (status && status !== "success") return sum;
    if (kind && kind !== "refund") return sum;

    return sum + parseMoneyToCents(transaction?.amount);
  }, 0);
}

export function buildIncrementalRefundSnapshot(previous, refundAmountCents) {
  const previousValueCents = numberOrZero(previous?.valueCents);
  const previousRefundedCents = numberOrZero(previous?.refundedCents);
  const originalValueCents = Math.max(
    numberOrZero(previous?.originalValueCents),
    previousValueCents + previousRefundedCents,
  );
  const refundedCents = Math.min(
    previousRefundedCents + numberOrZero(refundAmountCents),
    originalValueCents,
  );
  const isCancelled = Boolean(previous?.isCancelled);

  return {
    originalValueCents,
    refundedCents,
    valueCents: isCancelled
      ? 0
      : Math.max(originalValueCents - refundedCents, 0),
    isCancelled,
    currency: previous?.currency,
  };
}
