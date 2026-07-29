import assert from "node:assert/strict";
import test from "node:test";

import { formatMoneyFromCents, normalizeCurrencyCode } from "../app/money.js";

test("normalizes valid Shopify currency codes", () => {
  assert.equal(normalizeCurrencyCode(" usd "), "USD");
  assert.equal(normalizeCurrencyCode("gbp"), "GBP");
});

test("falls back safely for invalid currency codes", () => {
  assert.equal(normalizeCurrencyCode("not-a-currency"), "EUR");
});

test("formats the requested store currency instead of fixed euros", () => {
  const formatted = formatMoneyFromCents(12_345, "USD");

  assert.match(formatted, /123/);
  assert.match(formatted, /\$|USD/);
});
