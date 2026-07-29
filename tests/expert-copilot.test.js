import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeExpertChatResponse,
  normalizeExpertCampaignPackage,
  normalizeExpertMarketAnalysis,
  normalizeExpertWeeklyStrategy,
} from "../app/expert-copilot.js";

const products = [{ id: "p1", title: "Product one" }];

test("market analysis drops invented products and normalizes ranking", () => {
  const analysis = normalizeExpertMarketAnalysis(
    {
      summary: "Test",
      marketWindow: "Now",
      rankedProducts: [
        {
          productId: "invented",
          opportunityScore: 100,
          recommendedChannels: ["meta"],
        },
        {
          productId: "p1",
          opportunityScore: 500,
          recommendedChannels: ["meta", "unknown"],
        },
      ],
      portfolioPlan: [],
      dataLimits: [],
    },
    products,
  );

  assert.equal(analysis.rankedProducts.length, 1);
  assert.equal(analysis.rankedProducts[0].productId, "p1");
  assert.equal(analysis.rankedProducts[0].opportunityScore, 100);
  assert.deepEqual(analysis.rankedProducts[0].recommendedChannels, ["meta"]);
});

test("campaign package cannot allocate more than the merchant budget", () => {
  const draft = normalizeExpertCampaignPackage(
    {
      productId: "p1",
      campaignName: "Test campaign",
      channel: "meta",
      secondaryChannels: [],
      recommendedBudgetCents: 90_000,
      durationDays: 7,
      safeguards: [],
    },
    {
      product: products[0],
      monthlyAdBudgetCents: 30_000,
    },
  );

  assert.equal(draft.recommendedBudgetCents, 30_000);
  assert.match(draft.safeguards[0], /never starts external ad spend/i);
});

test("weekly budget stays within a quarter of the monthly budget", () => {
  const strategy = normalizeExpertWeeklyStrategy(
    {
      productPriorities: [
        { productId: "p1", priority: "test", reason: "Evidence" },
      ],
      channelPlan: [
        { channel: "meta", action: "Test", budgetCents: 50_000 },
        { channel: "google", action: "Test", budgetCents: 50_000 },
      ],
      totalRecommendedBudgetCents: 100_000,
    },
    {
      products,
      monthlyAdBudgetCents: 40_000,
    },
  );

  assert.equal(strategy.totalRecommendedBudgetCents, 10_000);
  assert.deepEqual(
    strategy.channelPlan.map((item) => item.budgetCents),
    [10_000, 0],
  );
});

test("chat actions cannot refer to invented shop products", () => {
  const response = normalizeExpertChatResponse(
    {
      answer: "Test",
      suggestedActions: [
        { label: "Known", intent: "review_product", productId: "p1" },
        { label: "Invented", intent: "review_product", productId: "nope" },
      ],
    },
    products,
  );

  assert.equal(response.suggestedActions[0].productId, "p1");
  assert.equal(response.suggestedActions[1].productId, null);
});
