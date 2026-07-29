import { useEffect, useState } from "react";
import { useLoaderData, useLocation, useNavigate } from "react-router";
import { Prisma } from "@prisma/client";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopPlan } from "../billing.server";
import { buildCumulativeCampaignResultRows } from "../analytics";
import { getCampaignSourceLabel } from "../campaign-sources";
import CampaignPerformanceChart from "../components/CampaignPerformanceChart.jsx";
import InfoLabel from "../components/InfoLabel.jsx";
import { DEFAULT_CURRENCY } from "../money";
import { useI18n } from "../i18n-context";
import {
  getCampaignCostUpdateMode,
  getPlanCapabilities,
  getPlanLabel as getCentralPlanLabel,
  isBasicPlan,
  isProPlan,
} from "../plans";
import { getShopCurrency } from "../shop-currency.server";
import styles from "../styles/campaign-details.module.css";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  BlockStack,
  InlineStack,
  DataTable,
  Badge,
  Button,
  Banner,
} from "@shopify/polaris";

// ----------------------
// Formatting helpers
// ----------------------
function formatRatio(value, formatNumber) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  return `${formatNumber(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}x`;
}
function formatCostInputFromCents(cents, intlLocale = "de-DE") {
  const value = Number(cents || 0) / 100;
  return new Intl.NumberFormat(intlLocale, {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
function numberOrZero(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

async function safeCopy(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function getPlanLabel(plan) {
  return getCentralPlanLabel(plan);
}

function getPlanTone(plan) {
  if (isProPlan(plan)) return "success";
  if (isBasicPlan(plan)) return "info";

  return "attention";
}

// ----------------------
// Metric helpers
// ----------------------
function calcProfit(costCents, revenueCents) {
  return numberOrZero(revenueCents) - numberOrZero(costCents);
}

function calcRoas(costCents, revenueCents) {
  const cost = numberOrZero(costCents);

  if (cost <= 0) return null;

  return numberOrZero(revenueCents) / cost;
}

function calcRoi(costCents, revenueCents) {
  const cost = numberOrZero(costCents);

  if (cost <= 0) return null;

  return calcProfit(costCents, revenueCents) / cost;
}

function calcConversionRate(clicks, orders) {
  const totalClicks = numberOrZero(clicks);

  if (totalClicks <= 0) return 0;

  return numberOrZero(orders) / totalClicks;
}

function calcAddToCartRate(clicks, addToCarts) {
  const totalClicks = numberOrZero(clicks);

  if (totalClicks <= 0) return 0;

  return numberOrZero(addToCarts) / totalClicks;
}

function calcCartToOrderRate(addToCarts, orders) {
  const totalAddToCarts = numberOrZero(addToCarts);

  if (totalAddToCarts <= 0) return 0;

  return numberOrZero(orders) / totalAddToCarts;
}

function calcAverageOrderValue(revenueCents, orders) {
  const totalOrders = numberOrZero(orders);

  if (totalOrders <= 0) return null;

  return Math.round(numberOrZero(revenueCents) / totalOrders);
}

function calcBreakEvenOrders(costCents, avgOrderValueCents) {
  const cost = numberOrZero(costCents);
  const avgOrder = numberOrZero(avgOrderValueCents);

  if (cost <= 0) return 0;
  if (avgOrder <= 0) return null;

  return Math.ceil(cost / avgOrder);
}

// ----------------------
// Range helpers
// ----------------------
function normalizeRange(value) {
  if (
    value === "live" ||
    value === "24h" ||
    value === "7d" ||
    value === "30d" ||
    value === "all"
  ) {
    return value;
  }

  return "30d";
}

function getRangeStart(range) {
  const now = new Date();

  if (range === "live") {
    const d = new Date(now);
    d.setMinutes(d.getMinutes() - 60);
    return d;
  }

  if (range === "24h") {
    const d = new Date(now);
    d.setHours(d.getHours() - 24);
    return d;
  }

  if (range === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }

  if (range === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }

  return null;
}

function getRangeLabel(range) {
  if (range === "live") return "Live · last 60 minutes";
  if (range === "24h") return "Last 24 hours";
  if (range === "7d") return "Last 7 days";
  if (range === "30d") return "Last 30 days";

  return "All time";
}

function getBucketForRange(range) {
  if (range === "live") return "minute";
  if (range === "24h") return "hour";
  if (range === "all") return "month";

  return "day";
}

function buildRangeUrl(campaignId, range, currentSearch = "") {
  const params = new URLSearchParams(currentSearch || "");
  params.set("range", range);

  return `/app/campaigns/${campaignId}?${params.toString()}`;
}

// ----------------------
// Ranking helpers
// ----------------------
function hasPerformanceSignal(campaign) {
  return (
    numberOrZero(campaign.costCents) > 0 ||
    numberOrZero(campaign.revenueCents) > 0 ||
    numberOrZero(campaign.ordersCount) > 0 ||
    numberOrZero(campaign.addToCartCount) > 0 ||
    numberOrZero(campaign.clicksCount) > 0
  );
}

function compareCampaignPerformance(a, b) {
  const aProfit = calcProfit(a.costCents, a.revenueCents);
  const bProfit = calcProfit(b.costCents, b.revenueCents);

  const aRoi = calcRoi(a.costCents, a.revenueCents) ?? 0;
  const bRoi = calcRoi(b.costCents, b.revenueCents) ?? 0;

  const aRoas = calcRoas(a.costCents, a.revenueCents) ?? 0;
  const bRoas = calcRoas(b.costCents, b.revenueCents) ?? 0;

  const aAddRate = calcAddToCartRate(a.clicksCount, a.addToCartCount);
  const bAddRate = calcAddToCartRate(b.clicksCount, b.addToCartCount);

  const aCartOrderRate = calcCartToOrderRate(a.addToCartCount, a.ordersCount);
  const bCartOrderRate = calcCartToOrderRate(b.addToCartCount, b.ordersCount);

  const checks = [
    bProfit - aProfit,
    bRoi - aRoi,
    numberOrZero(b.revenueCents) - numberOrZero(a.revenueCents),
    numberOrZero(b.ordersCount) - numberOrZero(a.ordersCount),
    bCartOrderRate - aCartOrderRate,
    bAddRate - aAddRate,
    numberOrZero(b.addToCartCount) - numberOrZero(a.addToCartCount),
    bRoas - aRoas,
    numberOrZero(b.clicksCount) - numberOrZero(a.clicksCount),
    numberOrZero(a.costCents) - numberOrZero(b.costCents),
  ];

  return checks.find((value) => value !== 0) || 0;
}

function getCampaignRanking(allCampaigns, currentCampaignId) {
  const ranked = allCampaigns
    .filter(hasPerformanceSignal)
    .sort(compareCampaignPerformance);

  const totalRankedCampaigns = ranked.length;
  const rankIndex = ranked.findIndex(
    (campaign) => campaign.id === currentCampaignId,
  );

  const rank = rankIndex >= 0 ? rankIndex + 1 : null;

  const current = ranked.find((campaign) => campaign.id === currentCampaignId);
  const currentProfit = current
    ? calcProfit(current.costCents, current.revenueCents)
    : 0;

  const isTopCampaign =
    rank === 1 && totalRankedCampaigns > 0 && currentProfit > 0;

  const isTopRanked =
    rank === 1 && totalRankedCampaigns > 0 && currentProfit <= 0;

  const needsAttention =
    rank === totalRankedCampaigns && totalRankedCampaigns > 1;

  let performanceLabel = "Waiting for data";

  if (isTopCampaign) {
    performanceLabel = "Top campaign";
  } else if (isTopRanked) {
    performanceLabel = "Top ranked";
  } else if (needsAttention) {
    performanceLabel = "Needs attention";
  } else if (rank) {
    performanceLabel = `Rank #${rank}`;
  }

  return {
    rank,
    totalRankedCampaigns,
    isTopCampaign,
    isTopRanked,
    needsAttention,
    performanceLabel,
  };
}

// ----------------------
// Chart helpers
// ----------------------
function getBucketSql(bucket) {
  if (bucket === "minute") {
    return Prisma.sql`
      date_trunc('hour', event."createdAt")
      + floor(date_part('minute', event."createdAt") / 10)
        * interval '10 minutes'
    `;
  }

  if (bucket === "hour") {
    return Prisma.sql`date_trunc('hour', event."createdAt")`;
  }

  if (bucket === "month") {
    return Prisma.sql`date_trunc('month', event."createdAt")`;
  }

  return Prisma.sql`date_trunc('day', event."createdAt")`;
}

async function loadEventBuckets({ campaignId, rangeStart, bucket }) {
  const bucketSql = getBucketSql(bucket);
  const rangeSql = rangeStart
    ? Prisma.sql`AND event."createdAt" >= ${rangeStart}`
    : Prisma.sql``;

  const rows = await db.$queryRaw(Prisma.sql`
    SELECT
      ${bucketSql} AS "date",
      COUNT(*) FILTER (WHERE event."type" = 'click')::INTEGER AS "clicks",
      COUNT(*) FILTER (
        WHERE event."type" = 'add_to_cart'
      )::INTEGER AS "addToCarts",
      COUNT(*) FILTER (
        WHERE event."type" = 'purchase'
          AND event."isCancelled" = FALSE
      )::INTEGER AS "orders",
      COUNT(*) FILTER (
        WHERE event."type" = 'purchase'
          AND event."isCancelled" = TRUE
      )::INTEGER AS "cancelledOrders",
      COALESCE(
        SUM(event."valueCents") FILTER (
          WHERE event."type" = 'purchase'
        ),
        0
      )::INTEGER AS "revenueCents",
      COALESCE(
        SUM(event."refundedCents") FILTER (
          WHERE event."type" = 'purchase'
        ),
        0
      )::INTEGER AS "refundedCents"
    FROM "Event" AS event
    WHERE event."campaignId" = ${campaignId}
    ${rangeSql}
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  return rows.map((row) => ({
    date: new Date(row.date).toISOString(),
    clicks: numberOrZero(row.clicks),
    addToCarts: numberOrZero(row.addToCarts),
    orders: numberOrZero(row.orders),
    cancelledOrders: numberOrZero(row.cancelledOrders),
    revenueCents: numberOrZero(row.revenueCents),
    refundedCents: numberOrZero(row.refundedCents),
  }));
}

function getMetricLabel(metric) {
  if (metric === "addToCarts") return "Add-to-Carts";
  if (metric === "orders") return "Orders";
  if (metric === "revenueCents") return "Net revenue";
  if (metric === "profitCents") return "Cumulative campaign result";

  return "Clicks";
}

function getBasicCampaignInsight(campaign, rangeStats) {
  const clicks = numberOrZero(rangeStats?.clicks);
  const orders = numberOrZero(rangeStats?.orders);
  const revenueCents = numberOrZero(rangeStats?.revenueCents);
  const profitCents = numberOrZero(rangeStats?.profitCents);
  const costCents = numberOrZero(campaign?.costCents);
  const roi = rangeStats?.roi;

  if (clicks < 10 && orders === 0) {
    return {
      tone: "info",
      title: "Waiting for more data",
      message:
        "This campaign has only a few clicks so far. Trends become clearer after more clicks and attributed orders.",
    };
  }

  if (clicks >= 10 && orders === 0) {
    return {
      tone: "warning",
      title: "Clicks, but no orders yet",
      message:
        "This campaign is getting attention, but no orders have been attributed yet. Check the destination page, offer, price or checkout flow.",
    };
  }

  if (orders > 0 && profitCents > 0 && roi !== null && roi > 0) {
    return {
      tone: "success",
      title: "Strong performer",
      message:
        "This campaign is generating attributed orders and a positive campaign result. Product, payment, shipping and return costs are not included yet.",
    };
  }

  if (costCents > 0 && revenueCents === 0) {
    return {
      tone: "critical",
      title: "Needs attention",
      message:
        "This campaign has cost but no attributed revenue yet. Keep watching it closely or pause it if performance does not improve.",
    };
  }

  if (profitCents < 0 && orders > 0) {
    return {
      tone: "warning",
      title: "Net revenue is coming in, but the campaign result is negative",
      message:
        "This campaign has attributed orders, but the campaign cost is still higher than the revenue. Check your margin, offer and campaign spend.",
    };
  }

  return {
    tone: "info",
    title: "Campaign is being tracked",
    message:
      "WhatSells is collecting clicks, orders and revenue for this campaign. More data will improve the guidance.",
  };
}

function getProCampaignInsight(campaign, rangeStats) {
  const clicks = numberOrZero(rangeStats?.clicks);
  const addToCarts = numberOrZero(rangeStats?.addToCarts);
  const orders = numberOrZero(rangeStats?.orders);
  const profitCents = numberOrZero(rangeStats?.profitCents);
  const addToCartRate = rangeStats?.addToCartRate ?? 0;
  const cartToOrderRate = rangeStats?.cartToOrderRate ?? 0;

  if (clicks < 10 && addToCarts === 0 && orders === 0) {
    return {
      tone: "info",
      title: "Pro analysis is waiting for more data",
      message:
        "The Pro funnel becomes useful after more clicks, cart actions and orders. Keep this campaign running until the pattern is clearer.",
    };
  }

  if (clicks >= 10 && addToCarts === 0) {
    return {
      tone: "critical",
      title: "Traffic is not turning into cart intent",
      message:
        "This campaign creates clicks, but visitors are not adding products to cart. Check the product page, product images, price, offer and above-the-fold message.",
    };
  }

  if (addToCarts > 0 && orders === 0) {
    return {
      tone: "warning",
      title: "Cart intent exists, but checkout is not converting",
      message:
        "People are adding products to cart, but no orders are attributed yet. Check shipping costs, trust signals, checkout friction and payment options.",
    };
  }

  if (addToCartRate >= 0.08 && cartToOrderRate < 0.2 && addToCarts >= 5) {
    return {
      tone: "warning",
      title: "Strong product interest, weak checkout conversion",
      message:
        "This campaign creates real cart intent, but too few carts become orders. The ad may be good — the checkout, shipping or offer may need work.",
    };
  }

  if (orders > 0 && profitCents > 0 && cartToOrderRate >= 0.2) {
    return {
      tone: "success",
      title: "Pro signal: scalable campaign",
      message:
        "This campaign creates clicks, cart intent and a positive campaign result. Check the product margin before increasing the budget.",
    };
  }

  if (orders > 0 && profitCents < 0) {
    return {
      tone: "warning",
      title: "Orders are coming in, but the campaign result is weak",
      message:
        "The funnel works, but the economics are not strong yet. Check campaign cost, product margin and average order value before scaling.",
    };
  }

  return {
    tone: "info",
    title: "Pro funnel is tracking",
    message:
      "WhatSells is reading the full path from click to cart to order. More data will make the recommendation sharper.",
  };
}

// ----------------------
// Loader
// ----------------------
export async function loader({ request, params }) {
  try {
    const trackBaseUrl =
      process.env.TRACK_BASE_URL ||
      process.env.SHOPIFY_APP_URL ||
      "https://app.whatsells.dev";

    const { session, admin } = await authenticate.admin(request);
    const shop = session.shop;
    const id = String(params.id || "").trim();

    if (!id) {
      throw new Response("Missing campaign id", { status: 400 });
    }

    const [plan, currency] = await Promise.all([
      getShopPlan({ shop, admin }),
      getShopCurrency(admin),
    ]);
    const capabilities = getPlanCapabilities(plan);
    const isPro = capabilities.canUseAddToCartTracking;
    const hasBasicAnalytics = capabilities.canUseCostAnalytics;

    const url = new URL(request.url);
    const requestedRange = normalizeRange(url.searchParams.get("range"));
    const range = capabilities.canUsePerformanceHistory
      ? requestedRange
      : "all";
    const rangeStart = getRangeStart(range);
    const bucket = getBucketForRange(range);

    const campaign = await db.campaign.findFirst({
      where: { id, shop },
      select: {
        id: true,
        shop: true,
        publicToken: true,
        name: true,
        sourceType: true,
        targetUrl: true,
        costCents: true,
        clicksCount: true,
        addToCartCount: true,
        revenueCents: true,
        refundedCents: true,
        ordersCount: true,
        cancelledOrdersCount: true,
        notes: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        productId: true,
        product: {
          select: {
            id: true,
            shopifyProductId: true,
            title: true,
            handle: true,
            status: true,
            onlineStoreUrl: true,
            imageUrl: true,
            imageAlt: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new Response("Campaign not found", { status: 404 });
    }

    const eventWhere = {
      campaignId: campaign.id,
      ...(rangeStart ? { createdAt: { gte: rangeStart } } : {}),
    };

    const [
      eventBuckets,
      attributedOrders,
      recentEvents,
      allCampaigns,
      clicks7d,
      clicks30d,
      addToCarts7d,
      addToCarts30d,
    ] = await Promise.all([
      loadEventBuckets({
        campaignId: campaign.id,
        rangeStart,
        bucket,
      }),

      db.event.findMany({
        where: {
          campaignId: campaign.id,
          type: "purchase",
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          createdAt: true,
          orderId: true,
          valueCents: true,
          originalValueCents: true,
          refundedCents: true,
          currency: true,
          isCancelled: true,
          reconciledAt: true,
        },
      }),

      db.event.findMany({
        where: eventWhere,
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          type: true,
          createdAt: true,
          referer: true,
          lang: true,
          valueCents: true,
          originalValueCents: true,
          refundedCents: true,
          currency: true,
          orderId: true,
          isCancelled: true,
          reconciledAt: true,
        },
      }),

      db.campaign.findMany({
        where: { shop },
        select: {
          id: true,
          name: true,
          costCents: true,
          clicksCount: true,
          addToCartCount: true,
          revenueCents: true,
          refundedCents: true,
          ordersCount: true,
          cancelledOrdersCount: true,
          createdAt: true,
        },
      }),

      db.event.count({
        where: {
          campaignId: campaign.id,
          type: "click",
          createdAt: { gte: getRangeStart("7d") },
        },
      }),

      db.event.count({
        where: {
          campaignId: campaign.id,
          type: "click",
          createdAt: { gte: getRangeStart("30d") },
        },
      }),

      db.event.count({
        where: {
          campaignId: campaign.id,
          type: "add_to_cart",
          createdAt: { gte: getRangeStart("7d") },
        },
      }),

      db.event.count({
        where: {
          campaignId: campaign.id,
          type: "add_to_cart",
          createdAt: { gte: getRangeStart("30d") },
        },
      }),
    ]);

    const rangeClicks = eventBuckets.reduce(
      (sum, row) => sum + numberOrZero(row.clicks),
      0,
    );
    const rangeAddToCarts = eventBuckets.reduce(
      (sum, row) => sum + numberOrZero(row.addToCarts),
      0,
    );
    const rangeOrders = eventBuckets.reduce(
      (sum, row) => sum + numberOrZero(row.orders),
      0,
    );
    const rangeCancelledOrders = eventBuckets.reduce(
      (sum, row) => sum + numberOrZero(row.cancelledOrders),
      0,
    );
    const rangeRevenueCents = eventBuckets.reduce(
      (sum, row) => sum + numberOrZero(row.revenueCents),
      0,
    );
    const rangeRefundedCents = eventBuckets.reduce(
      (sum, row) => sum + numberOrZero(row.refundedCents),
      0,
    );

    const profitCents = calcProfit(campaign.costCents, campaign.revenueCents);

    const conversionRate = calcConversionRate(
      campaign.clicksCount,
      campaign.ordersCount,
    );

    const addToCartRate = calcAddToCartRate(
      campaign.clicksCount,
      campaign.addToCartCount,
    );

    const cartToOrderRate = calcCartToOrderRate(
      campaign.addToCartCount,
      campaign.ordersCount,
    );

    const averageOrderValueCents = calcAverageOrderValue(
      campaign.revenueCents,
      campaign.ordersCount,
    );

    const roi = calcRoi(campaign.costCents, campaign.revenueCents);
    const roas = calcRoas(campaign.costCents, campaign.revenueCents);

    const breakEvenOrders = calcBreakEvenOrders(
      campaign.costCents,
      averageOrderValueCents,
    );

    const rangeProfitCents = calcProfit(campaign.costCents, rangeRevenueCents);
    const rangeConversionRate = calcConversionRate(rangeClicks, rangeOrders);
    const rangeAddToCartRate = calcAddToCartRate(rangeClicks, rangeAddToCarts);
    const rangeCartToOrderRate = calcCartToOrderRate(
      rangeAddToCarts,
      rangeOrders,
    );
    const rangeRoi = calcRoi(campaign.costCents, rangeRevenueCents);
    const rangeRoas = calcRoas(campaign.costCents, rangeRevenueCents);

    const ranking = getCampaignRanking(allCampaigns, campaign.id);

    const chartRows = buildCumulativeCampaignResultRows(
      eventBuckets,
      campaign.costCents,
    );

    return {
      loadError: null,
      range,
      rangeLabel: getRangeLabel(range),
      bucket,
      currency,
      plan: {
        ...capabilities,
        label: getPlanLabel(plan),
        isPro,
        isBasic: isBasicPlan(plan),
        upgradeUrl: plan.upgradeUrl,
        basicUrl: plan.basicUrl,
        proUrl: plan.proUrl,
      },
      campaign: {
        ...campaign,
        costCents: hasBasicAnalytics ? campaign.costCents : null,
        refundedCents: hasBasicAnalytics ? campaign.refundedCents : null,
        cancelledOrdersCount: hasBasicAnalytics
          ? campaign.cancelledOrdersCount
          : null,
        addToCartCount: isPro ? campaign.addToCartCount : null,
        clicks7d: capabilities.canUsePerformanceHistory ? clicks7d : null,
        clicks30d: capabilities.canUsePerformanceHistory ? clicks30d : null,
        addToCarts7d: isPro ? addToCarts7d : null,
        addToCarts30d: isPro ? addToCarts30d : null,
        profitCents: hasBasicAnalytics ? profitCents : null,
        conversionRate,
        addToCartRate: isPro ? addToCartRate : null,
        cartToOrderRate: isPro ? cartToOrderRate : null,
        averageOrderValueCents: hasBasicAnalytics
          ? averageOrderValueCents
          : null,
        roi: hasBasicAnalytics ? roi : null,
        roas: hasBasicAnalytics ? roas : null,
        breakEvenOrders: hasBasicAnalytics ? breakEvenOrders : null,
        goUrl: `${trackBaseUrl}/go/${campaign.publicToken}`,
        ...(capabilities.canUseCampaignComparison
          ? ranking
          : {
              rank: null,
              totalRankedCampaigns: null,
              isTopCampaign: false,
              needsAttention: false,
              performanceLabel: null,
            }),
      },
      rangeStats: {
        clicks: rangeClicks,
        addToCarts: isPro ? rangeAddToCarts : null,
        orders: rangeOrders,
        cancelledOrders: hasBasicAnalytics ? rangeCancelledOrders : null,
        revenueCents: rangeRevenueCents,
        refundedCents: hasBasicAnalytics ? rangeRefundedCents : null,
        profitCents: hasBasicAnalytics ? rangeProfitCents : null,
        conversionRate: rangeConversionRate,
        addToCartRate: isPro ? rangeAddToCartRate : null,
        cartToOrderRate: isPro ? rangeCartToOrderRate : null,
        roi: hasBasicAnalytics ? rangeRoi : null,
        roas: hasBasicAnalytics ? rangeRoas : null,
      },
      chartRows: capabilities.canUsePerformanceHistory ? chartRows : [],
      attributedOrders: capabilities.canViewOrderDetails
        ? attributedOrders
        : [],
      recentEvents: capabilities.canViewEventStream ? recentEvents : [],
    };
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    console.error("Campaign details loader failed:", error);

    return {
      loadError: error?.message || "Campaign details could not be loaded.",
      range: "30d",
      rangeLabel: "Last 30 days",
      bucket: "day",
      currency: DEFAULT_CURRENCY,
      plan: {
        ...getPlanCapabilities("free"),
        label: "Free",
        isPro: false,
        isBasic: false,
        upgradeUrl: "",
        basicUrl: "",
        proUrl: "",
      },
      campaign: null,
      rangeStats: null,
      chartRows: [],
      attributedOrders: [],
      recentEvents: [],
    };
  }
}

// ----------------------
// Small UI components
// ----------------------
function KpiCard({ label, value, helpText, infoKey, highlight = false }) {
  const border = highlight ? "1px solid #9f7aea" : "1px solid transparent";
  const background = highlight
    ? "linear-gradient(135deg, #f5f0ff 0%, #ffffff 70%)"
    : "#ffffff";

  return (
    <div className={styles.kpiCell}>
      <div
        style={{
          border,
          borderRadius: 14,
          background,
        }}
      >
        <Card>
          <BlockStack gap="100">
            <div style={{ color: "#616161", fontSize: 13 }}>
              <InfoLabel label={label} infoKey={infoKey} />
            </div>

            <Text variant="headingLg" as="p">
              {value}
            </Text>

            {helpText ? (
              <Text as="p" tone="subdued">
                {helpText}
              </Text>
            ) : null}
          </BlockStack>
        </Card>
      </div>
    </div>
  );
}

function EmptyDataState({ title, description }) {
  return (
    <div className={styles.emptyState}>
      <BlockStack gap="100">
        <Text as="p" fontWeight="semibold">
          {title}
        </Text>

        <Text as="p" tone="subdued">
          {description}
        </Text>
      </BlockStack>
    </div>
  );
}

function MetricButton({ active, children, onClick }) {
  return (
    <Button variant={active ? "primary" : "secondary"} onClick={onClick}>
      {children}
    </Button>
  );
}

function ProPanel({ children }) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 2,
        background:
          "linear-gradient(135deg, #111827 0%, #4c1d95 45%, #16a34a 100%)",
      }}
    >
      <div
        style={{
          borderRadius: 16,
          background: "#ffffff",
          padding: 16,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function LockedProPanel({ plan }) {
  const { t } = useI18n();
  return (
    <Banner tone="info">
      <BlockStack gap="200">
        <InlineStack gap="200" wrap>
          <Badge tone="attention">{t("Pro Analytics locked")}</Badge>
          <Text as="p" fontWeight="semibold">
            {t("Unlock the full click → add-to-cart → order funnel.")}
          </Text>
        </InlineStack>

        <Text as="p">
          {t(
            "Your current plan shows campaign results like clicks, orders, revenue, ROI and ROAS. Pro Analytics adds cart intent, add-to-cart rate, cart-to-order rate and sharper campaign diagnosis.",
          )}
        </Text>

        {plan?.proUrl || plan?.upgradeUrl ? (
          <Button
            variant="primary"
            onClick={() => {
              window.open(plan.proUrl || plan.upgradeUrl, "_top");
            }}
          >
            {t("Upgrade to Pro Analytics")}
          </Button>
        ) : null}
      </BlockStack>
    </Banner>
  );
}

function LockedBasicPanel({ plan, title, description }) {
  const { t } = useI18n();
  return (
    <Banner tone="info">
      <BlockStack gap="200">
        <InlineStack gap="200" wrap>
          <Badge tone="attention">{t("Basic analytics locked")}</Badge>

          <Text as="p" fontWeight="semibold">
            {title}
          </Text>
        </InlineStack>

        <Text as="p">{description}</Text>

        {plan?.basicUrl || plan?.upgradeUrl ? (
          <Button
            variant="primary"
            onClick={() => {
              window.open(plan.basicUrl || plan.upgradeUrl, "_top");
            }}
          >
            {t("Upgrade to Basic")}
          </Button>
        ) : null}
      </BlockStack>
    </Banner>
  );
}

function ChartTable({ rows, showProColumns, currency }) {
  const { t, formatDate, formatMoney } = useI18n();
  const formatDateTime = (value) =>
    value
      ? formatDate(value, { dateStyle: "medium", timeStyle: "short" })
      : "—";
  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">
          {t("Performance by period")}
        </Text>

        <Text as="p" tone="subdued">
          {showProColumns
            ? t(
                "Pro breakdown of clicks, add-to-carts, orders, revenue and the cumulative campaign result.",
              )
            : t(
                "A breakdown of clicks, orders, revenue and the cumulative campaign result for the selected time range.",
              )}
        </Text>

        {rows.length ? (
          <div className={styles.tableScroll}>
            <DataTable
              columnContentTypes={
                showProColumns
                  ? ["text", "numeric", "numeric", "numeric", "text", "text"]
                  : ["text", "numeric", "numeric", "text", "text"]
              }
              headings={
                showProColumns
                  ? [
                      t("Period"),
                      t("Clicks"),
                      <InfoLabel
                        key="add-to-carts"
                        label={t("Add-to-Carts")}
                        infoKey="addToCarts"
                      />,
                      <InfoLabel
                        key="orders"
                        label={t("Orders")}
                        infoKey="orders"
                      />,
                      <InfoLabel
                        key="net-revenue"
                        label={t("Net revenue")}
                        infoKey="revenue"
                      />,
                      <InfoLabel
                        key="campaign-result"
                        label={t("Cumulative result")}
                        infoKey="campaignResult"
                      />,
                    ]
                  : [
                      t("Period"),
                      t("Clicks"),
                      <InfoLabel
                        key="orders"
                        label={t("Orders")}
                        infoKey="orders"
                      />,
                      <InfoLabel
                        key="net-revenue"
                        label={t("Net revenue")}
                        infoKey="revenue"
                      />,
                      <InfoLabel
                        key="campaign-result"
                        label={t("Cumulative result")}
                        infoKey="campaignResult"
                      />,
                    ]
              }
              rows={rows.map((row) =>
                showProColumns
                  ? [
                      formatDateTime(row.date),
                      String(row.clicks),
                      String(row.addToCarts ?? 0),
                      String(row.orders),
                      formatMoney(row.revenueCents, currency),
                      formatMoney(row.profitCents, currency),
                    ]
                  : [
                      formatDateTime(row.date),
                      String(row.clicks),
                      String(row.orders),
                      formatMoney(row.revenueCents, currency),
                      formatMoney(row.profitCents, currency),
                    ],
              )}
            />
          </div>
        ) : (
          <EmptyDataState
            title={t("No performance data in this period")}
            description={t(
              "Use the campaign tracking link, then refresh this page after the first visit.",
            )}
          />
        )}
      </BlockStack>
    </Card>
  );
}

// ----------------------
// Component
// ----------------------
export default function CampaignDetails() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    t,
    intlLocale,
    formatDate,
    formatMoney,
    formatNumber,
    formatPercent,
  } = useI18n();
  const formatDateTime = (value) =>
    value
      ? formatDate(value, { dateStyle: "medium", timeStyle: "short" })
      : "—";

  const {
    loadError,
    campaign,
    plan,
    range,
    rangeLabel,
    bucket,
    currency = DEFAULT_CURRENCY,
    rangeStats,
    chartRows,
    attributedOrders,
    recentEvents,
  } = useLoaderData();

  const isPro = Boolean(plan?.isPro);
  const hasBasicAnalytics = Boolean(plan?.canUseCostAnalytics);
  const campaignCostUpdateMode = getCampaignCostUpdateMode(
    plan,
    campaign?.costCents,
  );
  const canSetInitialCampaignCost = campaignCostUpdateMode === "initial";
  const canUpdateCampaignCost = campaignCostUpdateMode !== "locked";

  const [metric, setMetric] = useState("clicks");
  const [copyStatus, setCopyStatus] = useState("");
  const [costInput, setCostInput] = useState(
    formatCostInputFromCents(campaign?.costCents || 0, intlLocale),
  );
  const [costUpdating, setCostUpdating] = useState(false);
  const [costUpdateStatus, setCostUpdateStatus] = useState("");
  const [costUpdateError, setCostUpdateError] = useState("");

  useEffect(() => {
    if (range !== "live") return;

    const interval = window.setInterval(() => {
      navigate(location.pathname + location.search);
    }, 30000);

    return () => window.clearInterval(interval);
  }, [range, navigate, location.pathname, location.search]);
  useEffect(() => {
    if (!campaign) return;

    setCostInput(formatCostInputFromCents(campaign.costCents || 0, intlLocale));
  }, [campaign?.id, campaign?.costCents, intlLocale]);

  if (loadError || !campaign) {
    return (
      <Page
        title={t("Campaign details")}
        backAction={{ content: t("Dashboard"), url: "/app" }}
      >
        <Layout>
          <Layout.Section>
            <Banner tone="critical">
              <BlockStack gap="200">
                <Text as="p">
                  {t(loadError || "Campaign details could not be loaded.")}
                </Text>

                <InlineStack gap="200">
                  <Button
                    onClick={() =>
                      navigate(location.pathname + location.search)
                    }
                  >
                    {t("Try again")}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const attributedOrderRows = attributedOrders.map((event) => {
    const orderCurrency = event.currency || currency;
    const status = event.isCancelled
      ? t("Cancelled")
      : numberOrZero(event.refundedCents) > 0
        ? numberOrZero(event.valueCents) > 0
          ? t("Partially refunded")
          : t("Refunded")
        : t("Active");

    return [
      formatDateTime(event.createdAt),
      event.orderId || "—",
      event.originalValueCents != null
        ? formatMoney(event.originalValueCents, orderCurrency)
        : "—",
      formatMoney(event.refundedCents || 0, orderCurrency),
      event.valueCents != null
        ? formatMoney(event.valueCents, orderCurrency)
        : "—",
      status,
      orderCurrency,
    ];
  });

  const eventRows = recentEvents.map((event) => [
    formatDateTime(event.createdAt),
    event.type === "purchase"
      ? t("order")
      : event.type === "add_to_cart"
        ? t("add-to-cart")
        : t(event.type),
    event.referer || "—",
    event.lang || "—",
    event.orderId || "—",
    event.valueCents != null
      ? formatMoney(event.valueCents, event.currency || currency)
      : "—",
  ]);

  const rankingTone = campaign.isTopCampaign
    ? "success"
    : campaign.needsAttention
      ? "attention"
      : "info";

  const campaignInsight = isPro
    ? getProCampaignInsight(campaign, rangeStats)
    : getBasicCampaignInsight(campaign, rangeStats);

  async function copyTrackingLink() {
    const ok = await safeCopy(campaign.goUrl);
    setCopyStatus(ok ? t("Tracking link copied.") : t("Could not copy link."));

    window.setTimeout(() => {
      setCopyStatus("");
    }, 2500);
  }

  function changeRange(nextRange) {
    navigate(buildRangeUrl(campaign.id, nextRange, location.search));
  }
  async function updateCampaignCost() {
    setCostUpdateStatus("");
    setCostUpdateError("");

    if (!canUpdateCampaignCost) {
      setCostUpdateError(
        hasBasicAnalytics
          ? t(
              "The initial cost is already set. Editing campaign costs over time is available in Pro.",
            )
          : t(
              "Campaign cost and profitability analytics are available from Basic.",
            ),
      );
      return;
    }

    setCostUpdating(true);

    try {
      const res = await fetch("/api/campaigns", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: campaign.id,
          cost: costInput,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          data?.error ||
            t("Could not update campaign cost ({status})", {
              status: res.status,
            }),
        );
      }

      setCostUpdateStatus(
        data?.message ||
          t(
            "Campaign cost saved. Campaign result, ROI and ROAS were recalculated.",
          ),
      );

      navigate(location.pathname + location.search);
    } catch (error) {
      setCostUpdateError(
        error?.message || t("Could not update campaign cost."),
      );
    } finally {
      setCostUpdating(false);
    }
  }

  return (
    <Page
      title={campaign.name}
      subtitle={`${
        campaign.product?.title || t("Unassigned product")
      } · ${t(getCampaignSourceLabel(campaign.sourceType))}`}
      backAction={{ content: t("Dashboard"), url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" gap="400" wrap>
                <BlockStack gap="150">
                  <Text as="p" tone="subdued">
                    {t("Shopify store: {shop}", { shop: campaign.shop })}
                  </Text>

                  <Text variant="headingLg" as="h1">
                    {campaign.name}
                  </Text>

                  <InlineStack gap="200" wrap>
                    <Badge
                      tone={
                        campaign.status === "active" ? "success" : "attention"
                      }
                    >
                      {t(
                        String(campaign.status).charAt(0).toUpperCase() +
                          String(campaign.status).slice(1),
                      )}
                    </Badge>

                    <Badge>
                      {t(getCampaignSourceLabel(campaign.sourceType))}
                    </Badge>

                    <Badge tone={campaign.product ? "info" : "attention"}>
                      {campaign.product?.title || t("Product not assigned")}
                    </Badge>

                    {hasBasicAnalytics ? (
                      <Badge tone={rankingTone}>
                        {campaign.performanceLabel?.startsWith("Rank #")
                          ? t("Rank #{rank}", {
                              rank: campaign.rank,
                            })
                          : t(campaign.performanceLabel)}
                      </Badge>
                    ) : null}

                    <Badge tone={isPro ? "success" : getPlanTone(plan)}>
                      {t(plan?.label || "Free")}
                    </Badge>
                  </InlineStack>

                  {hasBasicAnalytics ? (
                    campaign.rank ? (
                      <Text as="p" tone="subdued">
                        {t("Rank #{rank} of {count}", {
                          rank: campaign.rank,
                          count: campaign.totalRankedCampaigns,
                        })}
                      </Text>
                    ) : (
                      <Text as="p" tone="subdued">
                        {t(
                          "Waiting for more data before ranking this campaign.",
                        )}
                      </Text>
                    )
                  ) : null}
                </BlockStack>

                <BlockStack gap="150">
                  {campaign.product?.onlineStoreUrl ? (
                    <Button url={campaign.product.onlineStoreUrl} external>
                      {t("Open Shopify product")}
                    </Button>
                  ) : null}

                  <Button url={campaign.goUrl} external>
                    {t("Open tracking link")}
                  </Button>

                  <Button onClick={copyTrackingLink}>
                    {t("Copy tracking link")}
                  </Button>

                  {copyStatus ? (
                    <Text as="p" tone="subdued">
                      {copyStatus}
                    </Text>
                  ) : null}
                </BlockStack>
              </InlineStack>

              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">
                    {t("Tracking link")}
                  </Text>

                  <Text as="p" tone="subdued">
                    {t(
                      "Customers who open this link are redirected to the selected Shopify product. WhatSells uses the link to attribute clicks and orders to this campaign.",
                    )}
                  </Text>

                  <div className={styles.linkValue}>
                    <Text as="p">{campaign.goUrl}</Text>
                  </div>
                </BlockStack>
              </Card>

              {hasBasicAnalytics ? (
                <>
                  <InlineStack gap="200" wrap>
                    <Button
                      variant={range === "live" ? "primary" : "secondary"}
                      onClick={() => changeRange("live")}
                    >
                      {t("Live")}
                    </Button>

                    <Button
                      variant={range === "24h" ? "primary" : "secondary"}
                      onClick={() => changeRange("24h")}
                    >
                      {t("24h")}
                    </Button>

                    <Button
                      variant={range === "7d" ? "primary" : "secondary"}
                      onClick={() => changeRange("7d")}
                    >
                      {t("7 days")}
                    </Button>

                    <Button
                      variant={range === "30d" ? "primary" : "secondary"}
                      onClick={() => changeRange("30d")}
                    >
                      {t("30 days")}
                    </Button>

                    <Button
                      variant={range === "all" ? "primary" : "secondary"}
                      onClick={() => changeRange("all")}
                    >
                      {t("All time")}
                    </Button>
                  </InlineStack>

                  <Text as="p" tone="subdued">
                    {t("Current filter: {range}", {
                      range: t(rangeLabel),
                    })}
                    {range === "live"
                      ? t(" · auto refresh every 30 seconds")
                      : ""}
                  </Text>
                </>
              ) : (
                <Text as="p" tone="subdued">
                  {t(
                    "Free shows all-time core results. Basic unlocks Live, 24-hour, 7-day and 30-day performance views.",
                  )}
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <div className={styles.kpiGrid}>
            <KpiCard
              label={t("Clicks")}
              value={String(rangeStats.clicks)}
              helpText={t(rangeLabel)}
            />

            {isPro ? (
              <KpiCard
                label={t("Add-to-Carts")}
                infoKey="addToCarts"
                value={String(rangeStats.addToCarts)}
                helpText={t("Pro funnel signal")}
                highlight
              />
            ) : null}

            <KpiCard
              label={t("Orders")}
              infoKey="orders"
              value={String(rangeStats.orders)}
              helpText={t(rangeLabel)}
            />

            <KpiCard
              label={t("Conversion")}
              infoKey="conversion"
              value={formatPercent(rangeStats.conversionRate)}
              helpText={t("Orders divided by clicks")}
            />

            {isPro ? (
              <>
                <KpiCard
                  label={t("Add-to-Cart Rate")}
                  infoKey="addToCartRate"
                  value={formatPercent(rangeStats.addToCartRate)}
                  helpText={t("Carts divided by clicks")}
                  highlight
                />

                <KpiCard
                  label={t("Cart-to-Order")}
                  infoKey="cartToOrder"
                  value={formatPercent(rangeStats.cartToOrderRate)}
                  helpText={t("Orders divided by carts")}
                  highlight
                />
              </>
            ) : null}

            <KpiCard
              label={t("Net revenue")}
              infoKey="revenue"
              value={formatMoney(rangeStats.revenueCents, currency)}
              helpText={t("{range} · after refunds and cancellations", {
                range: t(rangeLabel),
              })}
            />

            {hasBasicAnalytics ? (
              <>
                <KpiCard
                  label={t("Campaign result")}
                  infoKey="campaignResult"
                  value={formatMoney(rangeStats.profitCents, currency)}
                  helpText={t(
                    "Attributed revenue minus the full campaign cost; product and operating costs are excluded.",
                  )}
                />

                <KpiCard
                  label={t("ROI")}
                  infoKey="roi"
                  value={formatPercent(rangeStats.roi)}
                  helpText={t("Campaign result divided by campaign cost")}
                />

                <KpiCard
                  label={t("ROAS")}
                  infoKey="roas"
                  value={formatRatio(rangeStats.roas, formatNumber)}
                  helpText={t("Revenue divided by cost")}
                />

                <KpiCard
                  label={t("Refunds")}
                  infoKey="refunds"
                  value={formatMoney(rangeStats.refundedCents || 0, currency)}
                  helpText={t(rangeLabel)}
                />

                <KpiCard
                  label={t("Cancelled orders")}
                  infoKey="cancelledOrders"
                  value={String(rangeStats.cancelledOrders || 0)}
                  helpText={t(rangeLabel)}
                />
              </>
            ) : null}
          </div>
        </Layout.Section>

        {!hasBasicAnalytics ? (
          <Layout.Section>
            <LockedBasicPanel
              plan={plan}
              title={t("Unlock profitability and time-range analysis.")}
              description={t(
                "Basic adds campaign cost, campaign result, ROI, ROAS, campaign ranking, detailed orders and charts for Live, 24 hours, 7 days, 30 days and all time.",
              )}
            />
          </Layout.Section>
        ) : null}

        <Layout.Section>
          {isPro ? (
            <ProPanel>
              <BlockStack gap="300">
                <InlineStack gap="200" wrap>
                  <Badge tone="success">{t("Pro Analytics")}</Badge>

                  <Text variant="headingMd" as="h2">
                    {t("Click → Add-to-Cart → Order funnel")}
                  </Text>
                </InlineStack>

                <Text as="p" tone="subdued">
                  {t(
                    "Pro separates attention from intent. Clicks show traffic, add-to-carts show buying interest, and orders show final conversion.",
                  )}
                </Text>

                <div className={styles.kpiGrid}>
                  <KpiCard
                    label={t("Clicks")}
                    value={String(rangeStats.clicks)}
                    helpText={t("Traffic")}
                    highlight
                  />

                  <KpiCard
                    label={t("Add-to-Carts")}
                    infoKey="addToCarts"
                    value={String(rangeStats.addToCarts)}
                    helpText={t("Buying intent")}
                    highlight
                  />

                  <KpiCard
                    label={t("Orders")}
                    infoKey="orders"
                    value={String(rangeStats.orders)}
                    helpText={t("Final conversion")}
                    highlight
                  />
                </div>
              </BlockStack>
            </ProPanel>
          ) : (
            <LockedProPanel plan={plan} />
          )}
        </Layout.Section>

        <Layout.Section>
          {isPro || canSetInitialCampaignCost ? (
            <ProPanel>
              <BlockStack gap="300">
                <InlineStack gap="200" wrap>
                  <Badge tone={isPro ? "success" : "info"}>
                    {isPro
                      ? t("Pro Cost Control")
                      : t("Basic profitability setup")}
                  </Badge>

                  <Text variant="headingMd" as="h2">
                    {isPro
                      ? t("Adjust campaign costs over time")
                      : t("Set the initial campaign cost")}
                  </Text>
                </InlineStack>

                <Text as="p" tone="subdued">
                  {isPro
                    ? t(
                        "Update the campaign cost when TikTok, Meta, Google, influencer or offline printing costs change. WhatSells recalculates the campaign result, ROI, ROAS and campaign diagnosis from the new cost.",
                      )
                    : t(
                        "This campaign was created before Basic profitability analytics were active. Add its initial total cost once to calculate campaign result, ROI and ROAS. Later cost changes require Pro.",
                      )}
                </Text>

                <div className={styles.costForm}>
                  <div>
                    <TextField
                      label={
                        <InfoLabel
                          label={t("Campaign cost ({currency})", {
                            currency,
                          })}
                          infoKey="campaignCost"
                        />
                      }
                      value={costInput}
                      onChange={setCostInput}
                      autoComplete="off"
                      placeholder={t("e.g. 187,50")}
                      helpText={
                        isPro
                          ? t("Use the current total cost for this campaign.")
                          : t(
                              "Save the total campaign cost carefully; Basic can set this initial value once.",
                            )
                      }
                    />
                  </div>

                  <Button
                    variant="primary"
                    onClick={updateCampaignCost}
                    loading={costUpdating}
                  >
                    {isPro ? t("Update cost") : t("Save initial cost")}
                  </Button>
                </div>

                {costUpdateStatus ? (
                  <Banner tone="success">
                    <Text as="p">{costUpdateStatus}</Text>
                  </Banner>
                ) : null}

                {costUpdateError ? (
                  <Banner tone="critical">
                    <Text as="p">{costUpdateError}</Text>
                  </Banner>
                ) : null}

                <div className={styles.kpiGrid}>
                  <KpiCard
                    label={t("Current cost")}
                    infoKey="campaignCost"
                    value={formatMoney(campaign.costCents || 0, currency)}
                    helpText={t("Used for campaign result, ROI and ROAS")}
                    highlight
                  />

                  <KpiCard
                    label={t("Campaign result")}
                    infoKey="campaignResult"
                    value={formatMoney(campaign.profitCents || 0, currency)}
                    helpText={t(
                      "Revenue minus campaign cost; product and operating costs are excluded",
                    )}
                    highlight
                  />

                  <KpiCard
                    label={t("ROI")}
                    infoKey="roi"
                    value={formatPercent(campaign.roi)}
                    helpText={t("Campaign result divided by campaign cost")}
                    highlight
                  />

                  <KpiCard
                    label={t("ROAS")}
                    infoKey="roas"
                    value={formatRatio(campaign.roas, formatNumber)}
                    helpText={t("Revenue divided by cost")}
                    highlight
                  />
                </div>
              </BlockStack>
            </ProPanel>
          ) : (
            <Banner tone="info">
              <BlockStack gap="200">
                <InlineStack gap="200" wrap>
                  <Badge tone="attention">
                    {hasBasicAnalytics
                      ? t("Pro Cost Control locked")
                      : t("Basic profitability locked")}
                  </Badge>

                  <Text as="p" fontWeight="semibold">
                    {hasBasicAnalytics
                      ? t("Adjust campaign costs over time with Pro.")
                      : t(
                          "Add campaign cost, campaign result, ROI and ROAS with Basic.",
                        )}
                  </Text>
                </InlineStack>

                <Text as="p">
                  {hasBasicAnalytics
                    ? t(
                        "Your initial campaign cost is saved. Pro lets you update it later when ads keep spending or offline material gets printed again.",
                      )
                    : t(
                        "Free keeps the core result simple: clicks, orders, net revenue and conversion. Basic adds the profitability layer.",
                      )}
                </Text>

                {(
                  hasBasicAnalytics
                    ? plan?.proUrl || plan?.upgradeUrl
                    : plan?.basicUrl || plan?.upgradeUrl
                ) ? (
                  <Button
                    variant="primary"
                    onClick={() => {
                      window.open(
                        hasBasicAnalytics
                          ? plan.proUrl || plan.upgradeUrl
                          : plan.basicUrl || plan.upgradeUrl,
                        "_top",
                      );
                    }}
                  >
                    {hasBasicAnalytics
                      ? t("Upgrade to Pro")
                      : t("Upgrade to Basic")}
                  </Button>
                ) : null}
              </BlockStack>
            </Banner>
          )}
        </Layout.Section>

        {hasBasicAnalytics ? (
          <Layout.Section>
            <Banner tone={campaignInsight.tone}>
              <BlockStack gap="100">
                <Text variant="headingSm" as="h2">
                  {isPro
                    ? t("Pro campaign diagnosis")
                    : t("Basic campaign insight")}
                  : {t(campaignInsight.title)}
                </Text>

                <Text as="p">{t(campaignInsight.message)}</Text>
              </BlockStack>
            </Banner>
          </Layout.Section>
        ) : null}

        {hasBasicAnalytics ? (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" gap="300" wrap>
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      {t("{metric} over time", {
                        metric: t(getMetricLabel(metric)),
                      })}
                    </Text>

                    <Text as="p" tone="subdued">
                      {t(rangeLabel)}
                    </Text>
                  </BlockStack>

                  <InlineStack gap="200" wrap>
                    <MetricButton
                      active={metric === "clicks"}
                      onClick={() => setMetric("clicks")}
                    >
                      {t("Clicks")}
                    </MetricButton>

                    {isPro ? (
                      <MetricButton
                        active={metric === "addToCarts"}
                        onClick={() => setMetric("addToCarts")}
                      >
                        {t("Add-to-Carts")}
                      </MetricButton>
                    ) : null}

                    <MetricButton
                      active={metric === "orders"}
                      onClick={() => setMetric("orders")}
                    >
                      {t("Orders")}
                    </MetricButton>

                    <MetricButton
                      active={metric === "revenueCents"}
                      onClick={() => setMetric("revenueCents")}
                    >
                      {t("Net revenue")}
                    </MetricButton>

                    <MetricButton
                      active={metric === "profitCents"}
                      onClick={() => setMetric("profitCents")}
                    >
                      {t("Cumulative result")}
                    </MetricButton>
                  </InlineStack>
                </InlineStack>

                <CampaignPerformanceChart
                  data={chartRows}
                  metric={metric}
                  bucket={bucket}
                  currency={currency}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        ) : null}

        {hasBasicAnalytics ? (
          <Layout.Section>
            <ChartTable
              rows={chartRows}
              showProColumns={isPro}
              currency={currency}
            />
          </Layout.Section>
        ) : null}

        {hasBasicAnalytics ? (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h2">
                    {t("Attributed orders")}
                  </Text>

                  <Text as="p" tone="subdued">
                    {t(
                      "Orders tracked through this campaign link. Refunds and cancellations are reconciled with Shopify and remain visible here for traceability.",
                    )}
                  </Text>
                </BlockStack>

                {attributedOrderRows.length ? (
                  <div className={styles.tableScroll}>
                    <DataTable
                      columnContentTypes={[
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                      ]}
                      headings={[
                        t("Time"),
                        t("Order"),
                        t("Original value"),
                        t("Refunded"),
                        t("Net value"),
                        t("Status"),
                        t("Currency"),
                      ]}
                      rows={attributedOrderRows}
                    />
                  </div>
                ) : (
                  <EmptyDataState
                    title={t("No attributed orders yet")}
                    description={t(
                      "Orders appear here after a customer completes checkout through this campaign's tracking journey.",
                    )}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        ) : null}

        {hasBasicAnalytics ? (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  {t("Recent tracking events")}
                </Text>

                {eventRows.length ? (
                  <div className={styles.tableScroll}>
                    <DataTable
                      columnContentTypes={[
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                      ]}
                      headings={[
                        t("Time"),
                        t("Type"),
                        t("Referer"),
                        t("Language"),
                        t("Order"),
                        t("Value"),
                      ]}
                      rows={eventRows}
                    />
                  </div>
                ) : (
                  <EmptyDataState
                    title={t("No tracking events in this period")}
                    description={t(
                      "Clicks and other campaign events will appear here after customers use the tracking link or QR code.",
                    )}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                {t("Campaign information")}
              </Text>
              <div className={styles.tableScroll}>
                <DataTable
                  columnContentTypes={["text", "text"]}
                  headings={[t("Metric"), t("Value")]}
                  rows={[
                    [t("Plan"), t(plan?.label || "Free")],
                    ...(hasBasicAnalytics
                      ? [
                          [
                            t("Clicks last 7 days"),
                            String(campaign.clicks7d ?? 0),
                          ],
                          [
                            t("Clicks last 30 days"),
                            String(campaign.clicks30d ?? 0),
                          ],
                        ]
                      : []),
                    ...(isPro
                      ? [
                          [
                            t("Add-to-Carts last 7 days"),
                            String(campaign.addToCarts7d ?? 0),
                          ],
                          [
                            t("Add-to-Carts last 30 days"),
                            String(campaign.addToCarts30d ?? 0),
                          ],
                        ]
                      : []),
                    [t("Clicks"), String(campaign.clicksCount ?? 0)],
                    ...(isPro
                      ? [
                          [
                            t("Add-to-Carts"),
                            String(campaign.addToCartCount ?? 0),
                          ],
                          [
                            t("Add-to-Cart Rate"),
                            formatPercent(campaign.addToCartRate),
                          ],
                          [
                            t("Cart-to-Order Rate"),
                            formatPercent(campaign.cartToOrderRate),
                          ],
                        ]
                      : []),
                    [
                      <InfoLabel
                        key="orders"
                        label={t("Orders")}
                        infoKey="orders"
                      />,
                      String(campaign.ordersCount ?? 0),
                    ],
                    ...(hasBasicAnalytics
                      ? [
                          [
                            <InfoLabel
                              key="cancelled-orders"
                              label={t("Cancelled orders")}
                              infoKey="cancelledOrders"
                            />,
                            String(campaign.cancelledOrdersCount ?? 0),
                          ],
                        ]
                      : []),
                    [
                      <InfoLabel
                        key="conversion"
                        label={t("Conversion")}
                        infoKey="conversion"
                      />,
                      formatPercent(campaign.conversionRate),
                    ],
                    [
                      <InfoLabel
                        key="net-revenue"
                        label={t("Net revenue")}
                        infoKey="revenue"
                      />,
                      formatMoney(campaign.revenueCents || 0, currency),
                    ],
                    ...(hasBasicAnalytics
                      ? [
                          [
                            <InfoLabel
                              key="refunds"
                              label={t("Refunds")}
                              infoKey="refunds"
                            />,
                            formatMoney(campaign.refundedCents || 0, currency),
                          ],
                          [
                            t("Cost"),
                            formatMoney(campaign.costCents || 0, currency),
                          ],
                          [
                            <InfoLabel
                              key="campaign-result"
                              label={t("Campaign result")}
                              infoKey="campaignResult"
                            />,
                            formatMoney(campaign.profitCents || 0, currency),
                          ],
                          [
                            <InfoLabel
                              key="roi"
                              label={t("ROI")}
                              infoKey="roi"
                            />,
                            formatPercent(campaign.roi),
                          ],
                          [
                            <InfoLabel
                              key="roas"
                              label={t("ROAS")}
                              infoKey="roas"
                            />,
                            formatRatio(campaign.roas, formatNumber),
                          ],
                          [
                            t("Break-even orders"),
                            campaign.breakEvenOrders != null
                              ? String(campaign.breakEvenOrders)
                              : "—",
                          ],
                        ]
                      : []),
                    [t("Created"), formatDateTime(campaign.createdAt)],
                    [t("Updated"), formatDateTime(campaign.updatedAt)],
                    [
                      t("Shopify product"),
                      campaign.product?.title || t("Unassigned"),
                    ],
                    [
                      t("Shopify product ID"),
                      campaign.product?.shopifyProductId || "—",
                    ],
                    [t("Destination URL"), campaign.targetUrl || "—"],
                    [t("Public token"), campaign.publicToken || "—"],
                    [t("Tracking link"), campaign.goUrl],
                    [t("Notes"), campaign.notes || "—"],
                  ]}
                />
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
