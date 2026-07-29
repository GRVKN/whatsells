import assert from "node:assert/strict";
import test from "node:test";

import {
  MINIMUM_MANAGED_PRICING_API_VERSION,
  formatSubscriptionPrice,
  getActiveSubscriptionQuery,
  hasSubscriptionPlan,
  resolveManagedPricingApiVersion,
} from "../app/billing-partner.js";

test("managed pricing always uses a Partner API version with activeSubscription", () => {
  assert.equal(MINIMUM_MANAGED_PRICING_API_VERSION, "2026-07");
  assert.equal(resolveManagedPricingApiVersion(), "2026-07");
  assert.equal(resolveManagedPricingApiVersion("2026-04"), "2026-07");
  assert.equal(resolveManagedPricingApiVersion("2026-07"), "2026-07");
  assert.equal(resolveManagedPricingApiVersion("2026-10"), "2026-10");
  assert.equal(resolveManagedPricingApiVersion("latest"), "2026-07");
});

test("active subscription query uses the current Price interface fields", () => {
  const query = getActiveSubscriptionQuery();

  assert.match(query, /activeSubscription\(appId: \$appId, shopId: \$shopId\)/);
  assert.match(query, /\.\.\. on FlatRatePrice/);
  assert.match(query, /\bcurrency\b/);
  assert.match(query, /\bamount\b/);
  assert.doesNotMatch(query, /\bcurrencyCode\b/);
});

test("Expert is detected from the managed-pricing subscription item handle", () => {
  const activeSubscription = {
    billingPeriod: "EVERY_30_DAYS",
    items: [
      {
        handle: "expert",
        description: "WhatSells Expert",
        price: {
          __typename: "FlatRatePrice",
          active: true,
          amount: "79.0",
          currency: "USD",
        },
      },
    ],
  };

  assert.equal(hasSubscriptionPlan(activeSubscription, "expert"), true);
  assert.equal(hasSubscriptionPlan(activeSubscription, "pro"), false);
});

test("managed-pricing flat-rate prices are formatted for diagnostics", () => {
  assert.equal(
    formatSubscriptionPrice({
      __typename: "FlatRatePrice",
      active: true,
      amount: "79.0",
      currency: "USD",
    }),
    "79.0 USD",
  );
  assert.equal(formatSubscriptionPrice(null), null);
});
