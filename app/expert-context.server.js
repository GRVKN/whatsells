import db from "./db.server.js";
import { getExpertUsageProgress } from "./expert-usage.server.js";

function clean(value, maxLength = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function ensureExpertGoal(shop, { dbClient = db } = {}) {
  return dbClient.expertGoal.upsert({
    where: { shop },
    create: { shop },
    update: {},
  });
}

export async function ensureExpertConversation(shop, { dbClient = db } = {}) {
  const existing = await dbClient.expertConversation.findFirst({
    where: { shop },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) return existing;

  return dbClient.expertConversation.create({
    data: {
      shop,
      title: "WhatSells Expert",
    },
  });
}

function mapProductMetrics(snapshot) {
  const scores = Array.isArray(snapshot?.analysis?.productScores)
    ? snapshot.analysis.productScores
    : [];

  return new Map(scores.map((score) => [score.id, score]));
}

export function buildSafeExpertProductContext(products, snapshot) {
  const metricsByProduct = mapProductMetrics(snapshot);

  return (Array.isArray(products) ? products : [])
    .slice(0, 250)
    .map((product) => {
      const metrics = metricsByProduct.get(product.id) || {};

      return {
        id: product.id,
        shopifyProductId: product.shopifyProductId,
        title: clean(product.title, 300),
        description: clean(product.description, 1_200),
        vendor: clean(product.vendor, 200),
        productType: clean(product.productType, 200),
        tags: (Array.isArray(product.tags) ? product.tags : []).slice(0, 20),
        onlineStoreUrl: clean(product.onlineStoreUrl, 2_000),
        hasImage: Boolean(product.imageUrl),
        minPriceCents: product.minPriceCents,
        maxPriceCents: product.maxPriceCents,
        currency: product.currency,
        totalInventory: product.totalInventory,
        measured: {
          campaignCount: Array.isArray(metrics.campaignIds)
            ? metrics.campaignIds.length
            : 0,
          channels: Array.isArray(metrics.channels) ? metrics.channels : [],
          clicks30d: Number(metrics.clicks30d) || 0,
          addToCarts30d: Number(metrics.addToCarts30d) || 0,
          orders30d: Number(metrics.orders30d) || 0,
          revenue30dCents: Number(metrics.revenue30dCents) || 0,
          lifetimeRevenueCents: Number(metrics.revenueCents) || 0,
          lifetimeCostCents: Number(metrics.costCents) || 0,
          opportunityScore: Number(metrics.score) || 0,
          confidence: clean(metrics.confidence, 20) || "Low",
        },
      };
    });
}

export async function buildExpertAiContext({
  shop,
  snapshot,
  selectedProductId = null,
  conversationId = null,
  dbClient = db,
}) {
  const [goal, products, recentMessages, latestMarket] = await Promise.all([
    ensureExpertGoal(shop, { dbClient }),
    dbClient.trackedProduct.findMany({
      where: {
        shop,
        status: "ACTIVE",
        onlineStoreUrl: { not: "" },
      },
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
      take: 250,
    }),
    conversationId
      ? dbClient.expertMessage.findMany({
          where: {
            shop,
            conversationId,
            kind: "chat",
          },
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            role: true,
            content: true,
            createdAt: true,
          },
        })
      : [],
    dbClient.expertMessage.findFirst({
      where: {
        shop,
        kind: "market_analysis",
        role: "assistant",
      },
      orderBy: { createdAt: "desc" },
      select: {
        structured: true,
        citations: true,
        createdAt: true,
      },
    }),
  ]);
  const safeProducts = buildSafeExpertProductContext(products, snapshot);
  const selectedProduct = selectedProductId
    ? safeProducts.find((product) => product.id === selectedProductId) || null
    : null;

  return {
    generatedAt: new Date().toISOString(),
    merchantGoal: {
      primaryGoal: goal.primaryGoal,
      monthlyAdBudgetCents: goal.monthlyAdBudgetCents,
      targetRevenueCents: goal.targetRevenueCents,
      targetRoas: goal.targetRoas,
      countryCode: goal.countryCode,
      language: goal.language,
      audience: clean(goal.audience),
      brandVoice: clean(goal.brandVoice),
      differentiators: clean(goal.differentiators),
      offerNotes: clean(goal.offerNotes),
      preferredChannels: goal.preferredChannels,
      excludedChannels: goal.excludedChannels,
    },
    snapshot: snapshot
      ? {
          dataThrough: snapshot.dataThrough,
          overview: snapshot.analysis?.overview || {},
          todayAction: snapshot.analysis?.todayAction || null,
          recommendations: Array.isArray(snapshot.analysis?.recommendations)
            ? snapshot.analysis.recommendations.slice(0, 8)
            : [],
        }
      : null,
    products: safeProducts,
    selectedProduct,
    latestMarketAnalysis: latestMarket
      ? {
          createdAt: latestMarket.createdAt,
          analysis: latestMarket.structured,
          citations: latestMarket.citations,
        }
      : null,
    recentConversation: [...recentMessages].reverse().map((message) => ({
      role: message.role,
      content: clean(message.content, 1_500),
      createdAt: message.createdAt,
    })),
  };
}

export async function loadExpertWorkspace({ shop, dbClient = db }) {
  const [goal, conversation, usage, drafts, assets] = await Promise.all([
    ensureExpertGoal(shop, { dbClient }),
    ensureExpertConversation(shop, { dbClient }),
    getExpertUsageProgress(shop, { dbClient }),
    dbClient.expertCampaignDraft.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        product: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
            onlineStoreUrl: true,
          },
        },
        campaign: {
          select: {
            id: true,
            publicToken: true,
            status: true,
          },
        },
        assets: {
          where: { status: "ready" },
          orderBy: { createdAt: "desc" },
          take: 4,
        },
      },
    }),
    dbClient.expertGeneratedAsset.findMany({
      where: {
        shop,
        status: "ready",
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        draftId: true,
        type: true,
        fileName: true,
        mimeType: true,
        width: true,
        height: true,
        createdAt: true,
        expiresAt: true,
      },
    }),
  ]);
  const messages = await dbClient.expertMessage.findMany({
    where: {
      shop,
      conversationId: conversation.id,
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return {
    goal,
    conversation,
    usage,
    drafts,
    assets,
    messages: messages.reverse(),
  };
}
