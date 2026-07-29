import assert from "node:assert/strict";
import test from "node:test";

import {
  applyExpertNarrative,
  buildExpertAnalysis,
} from "../app/expert-engine.js";

const now = new Date("2026-07-28T12:00:00.000Z");

function campaign(overrides = {}) {
  return {
    id: "campaign-1",
    name: "TikTok launch",
    sourceType: "tiktok",
    status: "active",
    costCents: 10_000,
    clicksCount: 200,
    addToCartCount: 20,
    revenueCents: 30_000,
    refundedCents: 0,
    ordersCount: 5,
    cancelledOrdersCount: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-07-28T10:00:00.000Z",
    product: {
      id: "product-1",
      shopifyProductId: "gid://shopify/Product/1",
      title: "Cooling vest",
      onlineStoreUrl: "https://shop.example/products/cooling-vest",
      imageUrl: null,
    },
    recent: {
      clicks7d: 60,
      clicksPrevious7d: 45,
      clicks30d: 150,
      addToCarts30d: 18,
      orders30d: 4,
      revenue30dCents: 24_000,
    },
    ...overrides,
  };
}

test("Expert asks for measurable data instead of inventing a shop decision", () => {
  const analysis = buildExpertAnalysis({
    campaigns: [],
    currency: "EUR",
    now,
  });

  assert.equal(analysis.status, "insufficient_data");
  assert.equal(analysis.todayAction.type, "create_first_campaign");
  assert.equal(analysis.productScores.length, 0);
});

test("Expert recommends a controlled scale only when value and orders support it", () => {
  const analysis = buildExpertAnalysis({
    campaigns: [campaign()],
    currency: "EUR",
    now,
  });

  assert.ok(
    analysis.recommendations.some((item) => item.type === "scale_controlled"),
  );
  assert.equal(analysis.productScores[0].title, "Cooling vest");
  assert.ok(analysis.productScores[0].score >= 65);
});

test("Expert does not scale a historically strong campaign with no recent evidence", () => {
  const analysis = buildExpertAnalysis({
    campaigns: [
      campaign({
        recent: {
          clicks7d: 0,
          clicksPrevious7d: 0,
          clicks30d: 0,
          addToCarts30d: 0,
          orders30d: 0,
          revenue30dCents: 0,
        },
      }),
    ],
    currency: "EUR",
    now,
  });

  assert.equal(
    analysis.recommendations.some((item) => item.type === "scale_controlled"),
    false,
  );
});

test("Expert protects budget when paid traffic has no attributed orders", () => {
  const analysis = buildExpertAnalysis({
    campaigns: [
      campaign({
        revenueCents: 0,
        ordersCount: 0,
        addToCartCount: 0,
        recent: {
          clicks7d: 50,
          clicksPrevious7d: 60,
          clicks30d: 180,
          addToCarts30d: 0,
          orders30d: 0,
          revenue30dCents: 0,
        },
      }),
    ],
    currency: "EUR",
    now,
  });

  assert.equal(analysis.todayAction.type, "pause_or_rework");
  assert.match(analysis.todayAction.nextStep, /not change the budget/i);
});

test("Expert identifies both the click-to-cart and cart-to-order leaks", () => {
  const lowIntent = campaign({
    id: "low-intent",
    name: "Meta traffic",
    clicksCount: 300,
    addToCartCount: 3,
    ordersCount: 1,
    costCents: 0,
    revenueCents: 5_000,
    recent: {
      clicks7d: 90,
      clicksPrevious7d: 80,
      clicks30d: 250,
      addToCarts30d: 3,
      orders30d: 1,
      revenue30dCents: 5_000,
    },
  });
  const checkoutLeak = campaign({
    id: "checkout-leak",
    name: "Packaging QR",
    sourceType: "packaging",
    clicksCount: 200,
    addToCartCount: 40,
    ordersCount: 3,
    costCents: 0,
    revenueCents: 12_000,
    recent: {
      clicks7d: 70,
      clicksPrevious7d: 65,
      clicks30d: 180,
      addToCarts30d: 35,
      orders30d: 3,
      revenue30dCents: 12_000,
    },
  });

  const analysis = buildExpertAnalysis({
    campaigns: [lowIntent, checkoutLeak],
    currency: "EUR",
    now,
  });
  const types = analysis.recommendations.map((item) => item.type);

  assert.ok(types.includes("fix_product_page"));
  assert.ok(types.includes("fix_checkout"));
});

test("AI narrative can rewrite explanations but cannot change actions or scores", () => {
  const analysis = buildExpertAnalysis({
    campaigns: [campaign()],
    currency: "EUR",
    now,
  });
  const originalScore = analysis.productScores[0].score;
  const key = analysis.todayAction.key;
  const enhanced = applyExpertNarrative(analysis, {
    overviewSummary: "A concise shop summary.",
    recommendations: [
      {
        key,
        summary: "A clearer summary.",
        rationale: "A clearer reason.",
        nextStep: "A clearer next step.",
      },
    ],
  });

  assert.equal(enhanced.overviewSummary, "A concise shop summary.");
  assert.equal(enhanced.todayAction.key, key);
  assert.equal(enhanced.todayAction.summary, "A clearer summary.");
  assert.equal(enhanced.productScores[0].score, originalScore);
});
