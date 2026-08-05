export const EXPERT_USAGE_CATEGORIES = Object.freeze({
  DAILY: "daily_analysis",
  CHAT: "chat",
  MARKET: "market_analysis",
  CAMPAIGN: "campaign_package",
  WEEKLY: "weekly_strategy",
  IMAGE: "image",
});

export const DEFAULT_EXPERT_MONTHLY_LIMITS = Object.freeze({
  [EXPERT_USAGE_CATEGORIES.DAILY]: 31,
  [EXPERT_USAGE_CATEGORIES.CHAT]: 100,
  [EXPERT_USAGE_CATEGORIES.MARKET]: 8,
  [EXPERT_USAGE_CATEGORIES.CAMPAIGN]: 20,
  [EXPERT_USAGE_CATEGORIES.WEEKLY]: 5,
  [EXPERT_USAGE_CATEGORIES.IMAGE]: 20,
});

export const DEFAULT_EXPERT_RESERVATION_MICROS = Object.freeze({
  [EXPERT_USAGE_CATEGORIES.DAILY]: 100_000,
  [EXPERT_USAGE_CATEGORIES.CHAT]: 100_000,
  [EXPERT_USAGE_CATEGORIES.MARKET]: 350_000,
  [EXPERT_USAGE_CATEGORIES.CAMPAIGN]: 300_000,
  [EXPERT_USAGE_CATEGORIES.WEEKLY]: 900_000,
  [EXPERT_USAGE_CATEGORIES.IMAGE]: 250_000,
});

export const DEFAULT_EXPERT_MONTHLY_COST_LIMIT_MICROS = 6_000_000;

const MODEL_RATES = Object.freeze({
  "gpt-5.6-luna": Object.freeze({
    input: 1,
    cachedInput: 0.1,
    output: 6,
  }),
  "gpt-5.6-terra": Object.freeze({
    input: 2.5,
    cachedInput: 0.25,
    output: 15,
  }),
  "gpt-5.6-sol": Object.freeze({
    input: 5,
    cachedInput: 0.5,
    output: 30,
  }),
});

const WEB_SEARCH_COST_MICROS = 10_000;
// Reserve against the most expensive medium format used by the flyer studio.
// The square GPT Image 2 output currently costs more than the portrait sizes.
const MEDIUM_FLYER_IMAGE_COST_MICROS = 53_000;

function nonnegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(Math.floor(number), 0) : 0;
}

export function calculateExpertCostMicros({
  model,
  inputTokens = 0,
  cachedInputTokens = 0,
  outputTokens = 0,
  webSearchCalls = 0,
  imageCount = 0,
}) {
  const rates = MODEL_RATES[model] || MODEL_RATES["gpt-5.6-sol"];
  const normalizedInput = nonnegativeInteger(inputTokens);
  const normalizedCached = Math.min(
    nonnegativeInteger(cachedInputTokens),
    normalizedInput,
  );
  const uncachedInput = normalizedInput - normalizedCached;
  const tokenCost =
    uncachedInput * rates.input +
    normalizedCached * rates.cachedInput +
    nonnegativeInteger(outputTokens) * rates.output;
  const toolCost = nonnegativeInteger(webSearchCalls) * WEB_SEARCH_COST_MICROS;
  const imageCost =
    nonnegativeInteger(imageCount) * MEDIUM_FLYER_IMAGE_COST_MICROS;

  return Math.max(Math.ceil(tokenCost + toolCost + imageCost), 0);
}

export function getUtcMonthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  return { start, end };
}

export function buildExpertUsageProgress({
  categoryCounts = {},
  committedCostMicros = 0,
  limits = DEFAULT_EXPERT_MONTHLY_LIMITS,
  costLimitMicros = DEFAULT_EXPERT_MONTHLY_COST_LIMIT_MICROS,
}) {
  const categories = Object.fromEntries(
    Object.values(EXPERT_USAGE_CATEGORIES).map((category) => {
      const used = nonnegativeInteger(categoryCounts[category]);
      const limit = nonnegativeInteger(limits[category]);

      return [
        category,
        {
          used,
          limit,
          remaining: Math.max(limit - used, 0),
        },
      ];
    }),
  );

  return {
    categories,
    committedCostMicros: nonnegativeInteger(committedCostMicros),
    costLimitMicros: nonnegativeInteger(costLimitMicros),
    remainingCostMicros: Math.max(
      nonnegativeInteger(costLimitMicros) -
        nonnegativeInteger(committedCostMicros),
      0,
    ),
  };
}
