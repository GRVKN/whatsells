import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExpertUsageProgress,
  calculateExpertCostMicros,
  getUtcMonthBounds,
} from "../app/expert-usage.js";

test("estimated cost uses the selected model, cached input and tools", () => {
  const cost = calculateExpertCostMicros({
    model: "gpt-5.6-terra",
    inputTokens: 1_000,
    cachedInputTokens: 200,
    outputTokens: 100,
    webSearchCalls: 1,
  });

  assert.equal(cost, 13_550);
});

test("image generation receives a bounded medium portrait estimate", () => {
  const cost = calculateExpertCostMicros({
    model: "gpt-image-2",
    imageCount: 1,
  });

  assert.equal(cost, 41_000);
});

test("monthly progress reports category and cost remainders", () => {
  const progress = buildExpertUsageProgress({
    categoryCounts: { chat: 7 },
    committedCostMicros: 1_500_000,
  });

  assert.equal(progress.categories.chat.remaining, 93);
  assert.equal(progress.remainingCostMicros, 4_500_000);
});

test("UTC month bounds do not depend on the server timezone", () => {
  const bounds = getUtcMonthBounds(new Date("2026-07-29T23:30:00.000Z"));

  assert.equal(bounds.start.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(bounds.end.toISOString(), "2026-08-01T00:00:00.000Z");
});
