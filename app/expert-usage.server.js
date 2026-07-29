import crypto from "node:crypto";

import db from "./db.server.js";
import {
  DEFAULT_EXPERT_MONTHLY_COST_LIMIT_MICROS,
  DEFAULT_EXPERT_MONTHLY_LIMITS,
  DEFAULT_EXPERT_RESERVATION_MICROS,
  buildExpertUsageProgress,
  calculateExpertCostMicros,
  getUtcMonthBounds,
} from "./expert-usage.js";

function positiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function getLimits() {
  return {
    ...DEFAULT_EXPERT_MONTHLY_LIMITS,
    chat: positiveIntegerEnv(
      "EXPERT_MONTHLY_CHAT_LIMIT",
      DEFAULT_EXPERT_MONTHLY_LIMITS.chat,
    ),
    market_analysis: positiveIntegerEnv(
      "EXPERT_MONTHLY_MARKET_LIMIT",
      DEFAULT_EXPERT_MONTHLY_LIMITS.market_analysis,
    ),
    campaign_package: positiveIntegerEnv(
      "EXPERT_MONTHLY_CAMPAIGN_LIMIT",
      DEFAULT_EXPERT_MONTHLY_LIMITS.campaign_package,
    ),
    image: positiveIntegerEnv(
      "EXPERT_MONTHLY_IMAGE_LIMIT",
      DEFAULT_EXPERT_MONTHLY_LIMITS.image,
    ),
  };
}

function getMonthlyCostLimitMicros() {
  return positiveIntegerEnv(
    "EXPERT_MONTHLY_COST_LIMIT_MICROS",
    DEFAULT_EXPERT_MONTHLY_COST_LIMIT_MICROS,
  );
}

export class ExpertUsageLimitError extends Error {
  constructor(message, { code, category, progress } = {}) {
    super(message);
    this.name = "ExpertUsageLimitError";
    this.code = code || "expert_usage_limit";
    this.category = category || null;
    this.progress = progress || null;
  }
}

async function loadUsageProgress(client, shop, now) {
  const { start, end } = getUtcMonthBounds(now);
  const [grouped, totals] = await Promise.all([
    client.expertUsage.groupBy({
      by: ["category"],
      where: {
        shop,
        createdAt: { gte: start, lt: end },
      },
      _count: { _all: true },
    }),
    client.expertUsage.aggregate({
      where: {
        shop,
        createdAt: { gte: start, lt: end },
      },
      _sum: {
        estimatedCostMicros: true,
        reservedCostMicros: true,
      },
    }),
  ]);
  const categoryCounts = Object.fromEntries(
    grouped.map((row) => [row.category, row._count._all]),
  );
  const committedCostMicros =
    Number(totals._sum.estimatedCostMicros) +
    Number(totals._sum.reservedCostMicros);

  return buildExpertUsageProgress({
    categoryCounts,
    committedCostMicros,
    limits: getLimits(),
    costLimitMicros: getMonthlyCostLimitMicros(),
  });
}

export async function getExpertUsageProgress(
  shop,
  { now = new Date(), dbClient = db } = {},
) {
  return loadUsageProgress(dbClient, String(shop || "").trim(), now);
}

export async function reserveExpertUsage({
  shop,
  category,
  model,
  now = new Date(),
  dbClient = db,
}) {
  const normalizedShop = String(shop || "").trim();
  const normalizedCategory = String(category || "").trim();
  const limits = getLimits();
  const categoryLimit = limits[normalizedCategory];
  const reservedCostMicros =
    DEFAULT_EXPERT_RESERVATION_MICROS[normalizedCategory];

  if (!normalizedShop || !categoryLimit || !reservedCostMicros) {
    throw new Error("A valid shop and Expert usage category are required.");
  }

  const requestId = crypto.randomUUID();
  const lockKey = `whatsells-expert:${normalizedShop}:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await dbClient.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
          const progress = await loadUsageProgress(tx, normalizedShop, now);
          const categoryProgress = progress.categories[normalizedCategory];

          if (
            !categoryProgress ||
            categoryProgress.used >= categoryProgress.limit
          ) {
            throw new ExpertUsageLimitError(
              "This Expert allowance is used up for the current month.",
              {
                code: "category_limit_reached",
                category: normalizedCategory,
                progress,
              },
            );
          }

          if (progress.remainingCostMicros < reservedCostMicros) {
            throw new ExpertUsageLimitError(
              "The monthly AI cost guard has been reached.",
              {
                code: "cost_limit_reached",
                category: normalizedCategory,
                progress,
              },
            );
          }

          const usage = await tx.expertUsage.create({
            data: {
              requestId,
              shop: normalizedShop,
              category: normalizedCategory,
              model,
              reservedCostMicros,
            },
          });

          return {
            requestId,
            usage,
            progress,
          };
        },
        {
          isolationLevel: "Serializable",
        },
      );
    } catch (error) {
      if (error instanceof ExpertUsageLimitError) throw error;
      if (error?.code !== "P2034" || attempt === 2) throw error;
    }
  }

  throw new Error("Could not reserve Expert usage.");
}

export async function completeExpertUsage({
  requestId,
  model,
  inputTokens = 0,
  cachedInputTokens = 0,
  outputTokens = 0,
  webSearchCalls = 0,
  imageCount = 0,
  providerResponseId = null,
  dbClient = db,
}) {
  const estimatedCostMicros = calculateExpertCostMicros({
    model,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    webSearchCalls,
    imageCount,
  });

  return dbClient.expertUsage.update({
    where: { requestId },
    data: {
      status: "succeeded",
      model,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      webSearchCalls,
      imageCount,
      estimatedCostMicros,
      reservedCostMicros: 0,
      providerResponseId,
      failureCode: null,
    },
  });
}

export async function failExpertUsage({
  requestId,
  failureCode = "provider_error",
  dbClient = db,
}) {
  if (!requestId) return null;

  return dbClient.expertUsage.update({
    where: { requestId },
    data: {
      status: "failed",
      reservedCostMicros: 0,
      failureCode: String(failureCode || "provider_error").slice(0, 120),
    },
  });
}
