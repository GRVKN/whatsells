import crypto from "node:crypto";

import db from "./db.server";
import { buildExpertAnalysis } from "./expert-engine.js";
import { enhanceExpertAnalysis } from "./expert-ai.server.js";
import { normalizeCurrencyCode } from "./money.js";

const UNCHANGED_REFRESH_COOLDOWN_MS = 60 * 60 * 1000;
const CHANGED_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

function daysAgo(days, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function startOfUtcDay(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function mapEventRows(rows, { includeRevenue = false } = {}) {
  return Object.fromEntries(
    rows.map((row) => [
      row.campaignId,
      {
        count: row._count._all,
        ...(includeRevenue
          ? { revenueCents: Number(row._sum?.valueCents) || 0 }
          : {}),
      },
    ]),
  );
}

async function loadEventWindow({
  campaignIds,
  type,
  gte,
  lt = undefined,
  includeRevenue = false,
}) {
  if (!campaignIds.length) return {};

  const rows = await db.event.groupBy({
    by: ["campaignId"],
    where: {
      campaignId: { in: campaignIds },
      type,
      createdAt: {
        gte,
        ...(lt ? { lt } : {}),
      },
      ...(type === "purchase" ? { isCancelled: false } : {}),
    },
    _count: { _all: true },
    ...(includeRevenue ? { _sum: { valueCents: true } } : {}),
  });

  return mapEventRows(rows, { includeRevenue });
}

async function loadExpertCampaigns(shop, now) {
  const campaigns = await db.campaign.findMany({
    where: { shop },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      sourceType: true,
      status: true,
      costCents: true,
      clicksCount: true,
      addToCartCount: true,
      revenueCents: true,
      refundedCents: true,
      ordersCount: true,
      cancelledOrdersCount: true,
      createdAt: true,
      updatedAt: true,
      product: {
        select: {
          id: true,
          shopifyProductId: true,
          title: true,
          onlineStoreUrl: true,
          imageUrl: true,
        },
      },
    },
  });

  const campaignIds = campaigns.map((campaign) => campaign.id);
  const sevenDaysAgo = daysAgo(7, now);
  const fourteenDaysAgo = daysAgo(14, now);
  const thirtyDaysAgo = daysAgo(30, now);

  const [clicks7d, clicksPrevious7d, clicks30d, addToCarts30d, purchases30d] =
    await Promise.all([
      loadEventWindow({
        campaignIds,
        type: "click",
        gte: sevenDaysAgo,
      }),
      loadEventWindow({
        campaignIds,
        type: "click",
        gte: fourteenDaysAgo,
        lt: sevenDaysAgo,
      }),
      loadEventWindow({
        campaignIds,
        type: "click",
        gte: thirtyDaysAgo,
      }),
      loadEventWindow({
        campaignIds,
        type: "add_to_cart",
        gte: thirtyDaysAgo,
      }),
      loadEventWindow({
        campaignIds,
        type: "purchase",
        gte: thirtyDaysAgo,
        includeRevenue: true,
      }),
    ]);

  return campaigns.map((campaign) => ({
    ...campaign,
    recent: {
      clicks7d: clicks7d[campaign.id]?.count || 0,
      clicksPrevious7d: clicksPrevious7d[campaign.id]?.count || 0,
      clicks30d: clicks30d[campaign.id]?.count || 0,
      addToCarts30d: addToCarts30d[campaign.id]?.count || 0,
      orders30d: purchases30d[campaign.id]?.count || 0,
      revenue30dCents: purchases30d[campaign.id]?.revenueCents || 0,
    },
  }));
}

function buildInputFingerprint({ campaigns, currency }) {
  const payload = campaigns.map((campaign) => ({
    id: campaign.id,
    status: campaign.status,
    productId: campaign.product?.id || null,
    sourceType: campaign.sourceType,
    costCents: campaign.costCents,
    clicksCount: campaign.clicksCount,
    addToCartCount: campaign.addToCartCount,
    revenueCents: campaign.revenueCents,
    refundedCents: campaign.refundedCents,
    ordersCount: campaign.ordersCount,
    cancelledOrdersCount: campaign.cancelledOrdersCount,
    updatedAt: campaign.updatedAt,
    recent: campaign.recent,
  }));

  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ currency, campaigns: payload }))
    .digest("hex");
}

export async function getOrCreateExpertSnapshot({
  shop,
  currency,
  force = false,
  now = new Date(),
}) {
  const normalizedShop = String(shop || "").trim();
  if (!normalizedShop) {
    throw new Error("Shop is required for Expert analysis.");
  }

  const normalizedCurrency = normalizeCurrencyCode(currency);
  const snapshotDate = startOfUtcDay(now);
  const existing = await db.expertSnapshot.findUnique({
    where: {
      shop_snapshotDate: {
        shop: normalizedShop,
        snapshotDate,
      },
    },
  });

  if (existing && !force) {
    return existing;
  }

  const campaigns = await loadExpertCampaigns(normalizedShop, now);
  const inputFingerprint = buildInputFingerprint({
    campaigns,
    currency: normalizedCurrency,
  });
  const snapshotAgeMs = existing
    ? Math.max(now.getTime() - new Date(existing.generatedAt).getTime(), 0)
    : Number.POSITIVE_INFINITY;
  const refreshCooldownMs =
    existing?.inputFingerprint === inputFingerprint
      ? UNCHANGED_REFRESH_COOLDOWN_MS
      : CHANGED_REFRESH_COOLDOWN_MS;

  if (existing && !force && snapshotAgeMs < refreshCooldownMs) {
    return existing;
  }

  const goal = await db.expertGoal.findUnique({
    where: { shop: normalizedShop },
    select: { language: true },
  });

  const deterministicAnalysis = buildExpertAnalysis({
    campaigns,
    currency: normalizedCurrency,
    now,
  });
  const enhanced = await enhanceExpertAnalysis(deterministicAnalysis, {
    shop: normalizedShop,
    language: goal?.language || "en",
  });
  const status = deterministicAnalysis.status;

  return db.expertSnapshot.upsert({
    where: {
      shop_snapshotDate: {
        shop: normalizedShop,
        snapshotDate,
      },
    },
    create: {
      shop: normalizedShop,
      snapshotDate,
      currency: normalizedCurrency,
      inputFingerprint,
      status,
      analysis: enhanced.analysis,
      aiStatus: enhanced.aiStatus,
      aiModel: enhanced.aiModel,
      dataThrough: now,
      generatedAt: now,
    },
    update: {
      currency: normalizedCurrency,
      inputFingerprint,
      status,
      analysis: enhanced.analysis,
      aiStatus: enhanced.aiStatus,
      aiModel: enhanced.aiModel,
      dataThrough: now,
      generatedAt: now,
    },
  });
}
