import { EXPERT_CHANNELS } from "./expert-schemas.js";

const CHANNEL_SET = new Set(EXPERT_CHANNELS);

function clean(value, maxLength = 1_500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nonnegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(Math.floor(number), 0) : 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(nonnegativeInteger(value), min), max);
}

function productIdSet(products) {
  return new Set(
    (Array.isArray(products) ? products : [])
      .map((product) => String(product?.id || "").trim())
      .filter(Boolean),
  );
}

export function normalizeExpertMarketAnalysis(value, products) {
  const ids = productIdSet(products);
  const seen = new Set();
  const rankedProducts = (
    Array.isArray(value?.rankedProducts) ? value.rankedProducts : []
  )
    .filter((item) => ids.has(String(item?.productId || "").trim()))
    .filter((item) => {
      const id = String(item.productId).trim();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, 10)
    .map((item, index) => ({
      ...item,
      productId: String(item.productId).trim(),
      rank: index + 1,
      opportunityScore: clamp(item.opportunityScore, 0, 100),
      recommendedChannels: (() => {
        const channels = (
          Array.isArray(item.recommendedChannels)
            ? item.recommendedChannels
            : []
        )
          .filter((channel) => CHANNEL_SET.has(channel))
          .slice(0, 4);
        return channels.length ? channels : ["link"];
      })(),
    }));

  if (!rankedProducts.length) {
    throw new Error("The market analysis did not return a valid shop product.");
  }

  return {
    ...value,
    summary: clean(value?.summary),
    marketWindow: clean(value?.marketWindow, 500),
    rankedProducts,
    portfolioPlan: (Array.isArray(value?.portfolioPlan)
      ? value.portfolioPlan
      : []
    )
      .filter((item) => ids.has(String(item?.productId || "").trim()))
      .filter((item) => CHANNEL_SET.has(item?.channel))
      .slice(0, 5),
    dataLimits: (Array.isArray(value?.dataLimits) ? value.dataLimits : [])
      .map((item) => clean(item, 500))
      .filter(Boolean)
      .slice(0, 8),
  };
}

export function normalizeExpertCampaignPackage(
  value,
  { product, monthlyAdBudgetCents = 0 },
) {
  const productId = String(product?.id || "").trim();
  if (!productId || String(value?.productId || "").trim() !== productId) {
    throw new Error("The campaign package referenced the wrong shop product.");
  }

  const channel = CHANNEL_SET.has(value?.channel) ? value.channel : "link";
  const monthlyBudget = nonnegativeInteger(monthlyAdBudgetCents);
  const recommendedBudget = nonnegativeInteger(value?.recommendedBudgetCents);
  const safeBudget =
    monthlyBudget > 0 ? Math.min(recommendedBudget, monthlyBudget) : 0;
  const mandatorySafeguards = [
    "This is a draft. WhatSells never starts external ad spend automatically.",
    ...(monthlyBudget > 0
      ? []
      : [
          "No monthly test budget is saved, so the draft does not allocate money.",
        ]),
  ];
  const safeguards = [
    ...mandatorySafeguards,
    ...(Array.isArray(value?.safeguards) ? value.safeguards : []),
  ]
    .map((item) => clean(item, 500))
    .filter(
      (item, index, values) => Boolean(item) && values.indexOf(item) === index,
    )
    .slice(0, 6);

  return {
    ...value,
    productId,
    campaignName:
      clean(value?.campaignName, 120) ||
      `${clean(product?.title, 80)} · Expert test`,
    channel,
    secondaryChannels: (Array.isArray(value?.secondaryChannels)
      ? value.secondaryChannels
      : []
    )
      .filter((item) => CHANNEL_SET.has(item) && item !== channel)
      .slice(0, 3),
    recommendedBudgetCents: safeBudget,
    durationDays: clamp(value?.durationDays, 1, 90),
    safeguards,
  };
}

export function normalizeExpertWeeklyStrategy(
  value,
  { products, monthlyAdBudgetCents = 0 },
) {
  const ids = productIdSet(products);
  const monthlyBudget = nonnegativeInteger(monthlyAdBudgetCents);
  const weeklyCeiling = monthlyBudget > 0 ? Math.ceil(monthlyBudget / 4) : 0;
  const productPriorities = (
    Array.isArray(value?.productPriorities) ? value.productPriorities : []
  )
    .filter((item) => ids.has(String(item?.productId || "").trim()))
    .slice(0, 8);
  let remainingBudget = weeklyCeiling;
  const channelPlan = (
    Array.isArray(value?.channelPlan) ? value.channelPlan : []
  )
    .filter((item) => CHANNEL_SET.has(item?.channel))
    .slice(0, 8)
    .map((item) => {
      const budgetCents =
        weeklyCeiling > 0
          ? Math.min(nonnegativeInteger(item.budgetCents), remainingBudget)
          : 0;
      remainingBudget -= budgetCents;

      return {
        ...item,
        budgetCents,
      };
    });
  const planTotal = channelPlan.reduce(
    (sum, item) => sum + item.budgetCents,
    0,
  );

  return {
    ...value,
    productPriorities,
    channelPlan,
    totalRecommendedBudgetCents: planTotal,
  };
}

export function normalizeExpertChatResponse(value, products) {
  const ids = productIdSet(products);

  return {
    ...value,
    suggestedActions: (Array.isArray(value?.suggestedActions)
      ? value.suggestedActions
      : []
    ).map((action) => {
      const productId = String(action?.productId || "").trim();

      return {
        ...action,
        productId: ids.has(productId) ? productId : null,
      };
    }),
  };
}

export function cleanExpertQuestion(value) {
  return clean(value, 1_500);
}
