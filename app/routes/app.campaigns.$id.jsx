import { useEffect, useState } from "react";
import { useLoaderData, useLocation, useNavigate } from "react-router";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopPlan } from "../billing.server";
import CampaignPerformanceChart from "../components/CampaignPerformanceChart.jsx";
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

const FREE_CAMPAIGN_LIMIT = 3;
const BASIC_CAMPAIGN_LIMIT = 20;

// ----------------------
// Formatting helpers
// ----------------------
function formatDateTime(value) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function formatMoneyFromCents(cents) {
  const value = Number(cents || 0) / 100;

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatRatio(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  return `${Number(value).toFixed(2)}x`;
}
function formatCostInputFromCents(cents) {
  const value = Number(cents || 0) / 100;
  return value.toFixed(2).replace(".", ",");
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

// ----------------------
// Plan helpers
// ----------------------
function cleanStr(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePlanName(plan) {
  return cleanStr(plan?.plan || plan?.name || plan?.currentPlan).toLowerCase();
}

function isProPlan(plan) {
  const planName = normalizePlanName(plan);

  return Boolean(
    plan?.isPro ||
      plan?.isExpert ||
      plan?.hasPro ||
      planName === "pro" ||
      planName === "pro analytics" ||
      planName === "expert" ||
      planName === "expert+" ||
      planName === "expert_plus",
  );
}

function isBasicPlan(plan) {
  const planName = normalizePlanName(plan);

  return Boolean(
    plan?.isBasic ||
      plan?.hasBasic ||
      planName === "basic" ||
      planName === "basic analytics",
  );
}

function getPlanLabel(plan) {
  if (isProPlan(plan)) return "Pro Analytics";
  if (isBasicPlan(plan)) return "Basic";

  return "Free";
}

function getPlanTone(plan) {
  if (isProPlan(plan)) return "success";
  if (isBasicPlan(plan)) return "info";

  return "attention";
}

function getCampaignLimit(plan) {
  if (isProPlan(plan)) return null;
  if (isBasicPlan(plan)) return BASIC_CAMPAIGN_LIMIT;

  return FREE_CAMPAIGN_LIMIT;
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

function startOfHour(date) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfTenMinuteBucket(date) {
  const d = new Date(date);
  const minutes = d.getMinutes();
  d.setMinutes(Math.floor(minutes / 10) * 10, 0, 0);
  return d;
}

function getBucketDate(date, bucket) {
  if (bucket === "minute") return startOfTenMinuteBucket(date);
  if (bucket === "hour") return startOfHour(date);
  if (bucket === "month") return startOfMonth(date);

  return startOfDay(date);
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
function buildChartRows(events, bucket, campaignCostCents) {
  const map = new Map();

  for (const event of events) {
    const bucketDate = getBucketDate(event.createdAt, bucket);
    const key = bucketDate.toISOString();

    if (!map.has(key)) {
      map.set(key, {
        date: key,
        clicks: 0,
        addToCarts: 0,
        orders: 0,
        revenueCents: 0,
        profitCents: 0,
      });
    }

    const row = map.get(key);

    if (event.type === "click") {
      row.clicks += 1;
    }

    if (event.type === "add_to_cart") {
      row.addToCarts += 1;
    }

    if (event.type === "purchase") {
      row.orders += 1;
      row.revenueCents += numberOrZero(event.valueCents);
    }
  }

  const rows = [...map.values()].sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  return rows.map((row) => ({
    ...row,
    profitCents: row.revenueCents - numberOrZero(campaignCostCents),
  }));
}

function getMetricLabel(metric) {
  if (metric === "addToCarts") return "Add-to-Carts";
  if (metric === "orders") return "Orders";
  if (metric === "revenueCents") return "Revenue";
  if (metric === "profitCents") return "Profit";

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
        "This campaign is generating attributed orders and positive profit. Consider increasing the budget or repeating this campaign idea.",
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
      title: "Revenue is coming in, but profit is negative",
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
        "This campaign creates clicks, cart intent and profitable orders. This is the type of campaign worth repeating, testing with more budget or turning into a template.",
    };
  }

  if (orders > 0 && profitCents < 0) {
    return {
      tone: "warning",
      title: "Orders are coming in, but profit is weak",
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

    const plan = await getShopPlan({ shop, admin });
    const isPro = isProPlan(plan);
    const campaignLimit = getCampaignLimit(plan);

    const url = new URL(request.url);
    const range = normalizeRange(url.searchParams.get("range"));
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
        ordersCount: true,
        notes: true,
        status: true,
        createdAt: true,
        updatedAt: true,
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
      events,
      attributedOrders,
      allCampaigns,
      clicks7d,
      clicks30d,
      addToCarts7d,
      addToCarts30d,
    ] = await Promise.all([
      db.event.findMany({
        where: eventWhere,
        orderBy: { createdAt: "asc" },
        take: range === "all" ? 3000 : 1000,
        select: {
          id: true,
          type: true,
          createdAt: true,
          referer: true,
          lang: true,
          valueCents: true,
          currency: true,
          orderId: true,
        },
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
          currency: true,
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
          ordersCount: true,
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

    const rangeClicks = events.filter((event) => event.type === "click").length;
    const rangeAddToCarts = events.filter(
      (event) => event.type === "add_to_cart",
    ).length;
    const rangeOrders = events.filter(
      (event) => event.type === "purchase",
    ).length;

    const rangeRevenueCents = events.reduce((sum, event) => {
      if (event.type !== "purchase") return sum;

      return sum + numberOrZero(event.valueCents);
    }, 0);

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
    const rangeAddToCartRate = calcAddToCartRate(
      rangeClicks,
      rangeAddToCarts,
    );
    const rangeCartToOrderRate = calcCartToOrderRate(
      rangeAddToCarts,
      rangeOrders,
    );
    const rangeRoi = calcRoi(campaign.costCents, rangeRevenueCents);
    const rangeRoas = calcRoas(campaign.costCents, rangeRevenueCents);

    const ranking = getCampaignRanking(allCampaigns, campaign.id);

    const chartRows = buildChartRows(events, bucket, campaign.costCents);

    return {
      loadError: null,
      range,
      rangeLabel: getRangeLabel(range),
      bucket,
      plan: {
        label: getPlanLabel(plan),
        isPro,
        isBasic: isBasicPlan(plan),
        campaignLimit,
        upgradeUrl: plan.upgradeUrl,
        basicUrl: plan.basicUrl,
        proUrl: plan.proUrl,
      },
      campaign: {
        ...campaign,
        clicks7d,
        clicks30d,
        addToCarts7d,
        addToCarts30d,
        profitCents,
        conversionRate,
        addToCartRate,
        cartToOrderRate,
        averageOrderValueCents,
        roi,
        roas,
        breakEvenOrders,
        goUrl: `${trackBaseUrl}/go/${campaign.publicToken}`,
        ...ranking,
      },
      rangeStats: {
        clicks: rangeClicks,
        addToCarts: rangeAddToCarts,
        orders: rangeOrders,
        revenueCents: rangeRevenueCents,
        profitCents: rangeProfitCents,
        conversionRate: rangeConversionRate,
        addToCartRate: rangeAddToCartRate,
        cartToOrderRate: rangeCartToOrderRate,
        roi: rangeRoi,
        roas: rangeRoas,
      },
      chartRows,
      attributedOrders,
      recentEvents: [...events].reverse().slice(0, 30),
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
      plan: {
        label: "Free",
        isPro: false,
        isBasic: false,
        campaignLimit: FREE_CAMPAIGN_LIMIT,
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
function KpiCard({ label, value, helpText, highlight = false }) {
  const border = highlight ? "1px solid #9f7aea" : "1px solid transparent";
  const background = highlight
    ? "linear-gradient(135deg, #f5f0ff 0%, #ffffff 70%)"
    : "#ffffff";

  return (
    <div style={{ minWidth: 170, flex: 1 }}>
      <div
        style={{
          border,
          borderRadius: 14,
          background,
        }}
      >
        <Card>
          <BlockStack gap="100">
            <Text as="p" tone="subdued">
              {label}
            </Text>

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
  return (
    <Banner tone="info">
      <BlockStack gap="200">
        <InlineStack gap="200" wrap>
          <Badge tone="attention">Pro Analytics locked</Badge>
          <Text as="p" fontWeight="semibold">
            Unlock the full click → add-to-cart → order funnel.
          </Text>
        </InlineStack>

        <Text as="p">
          Your current plan shows campaign results like clicks, orders, revenue,
          ROI and ROAS. Pro Analytics adds cart intent, add-to-cart rate,
          cart-to-order rate and sharper campaign diagnosis.
        </Text>

        {plan?.proUrl || plan?.upgradeUrl ? (
          <Button
            variant="primary"
            onClick={() => {
              window.open(plan.proUrl || plan.upgradeUrl, "_top");
            }}
          >
            Upgrade to Pro Analytics
          </Button>
        ) : null}
      </BlockStack>
    </Banner>
  );
}

function ChartTable({ rows, showProColumns }) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">
          Performance by period
        </Text>

        <Text as="p" tone="subdued">
          {showProColumns
            ? "Pro breakdown of clicks, add-to-carts, orders, revenue and profit."
            : "A simple breakdown of clicks, orders, revenue and profit for the selected time range."}
        </Text>

        <DataTable
          columnContentTypes={
            showProColumns
              ? ["text", "numeric", "numeric", "numeric", "text", "text"]
              : ["text", "numeric", "numeric", "text", "text"]
          }
          headings={
            showProColumns
              ? [
                  "Period",
                  "Clicks",
                  "Add-to-Carts",
                  "Orders",
                  "Revenue",
                  "Profit",
                ]
              : ["Period", "Clicks", "Orders", "Revenue", "Profit"]
          }
          rows={
            rows.length
              ? rows.map((row) =>
                  showProColumns
                    ? [
                        formatDateTime(row.date),
                        String(row.clicks),
                        String(row.addToCarts ?? 0),
                        String(row.orders),
                        formatMoneyFromCents(row.revenueCents),
                        formatMoneyFromCents(row.profitCents),
                      ]
                    : [
                        formatDateTime(row.date),
                        String(row.clicks),
                        String(row.orders),
                        formatMoneyFromCents(row.revenueCents),
                        formatMoneyFromCents(row.profitCents),
                      ],
                )
              : showProColumns
                ? [["—", "—", "—", "—", "—", "—"]]
                : [["—", "—", "—", "—", "—"]]
          }
        />
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
    loadError,
    campaign,
    plan,
    range,
    rangeLabel,
    bucket,
    rangeStats,
    chartRows,
    attributedOrders,
    recentEvents,
  } = useLoaderData();

  const isPro = Boolean(plan?.isPro);

  const [metric, setMetric] = useState("clicks");
  const [copyStatus, setCopyStatus] = useState("");
  const [costInput, setCostInput] = useState(
  formatCostInputFromCents(campaign?.costCents || 0),
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

  setCostInput(formatCostInputFromCents(campaign.costCents || 0));
}, [campaign?.id, campaign?.costCents]);

  if (loadError || !campaign) {
    return (
      <Page
        title="Campaign details"
        backAction={{ content: "Dashboard", url: "/app" }}
      >
        <Layout>
          <Layout.Section>
            <Banner tone="critical">
              {loadError || "Campaign details could not be loaded."}
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const attributedOrderRows = attributedOrders.map((event) => [
    formatDateTime(event.createdAt),
    event.orderId || "—",
    event.valueCents != null ? formatMoneyFromCents(event.valueCents) : "—",
    event.currency || "—",
  ]);

  const eventRows = recentEvents.map((event) => [
    formatDateTime(event.createdAt),
    event.type === "purchase"
      ? "order"
      : event.type === "add_to_cart"
        ? "add-to-cart"
        : event.type,
    event.referer || "—",
    event.lang || "—",
    event.orderId || "—",
    event.valueCents != null ? formatMoneyFromCents(event.valueCents) : "—",
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
    setCopyStatus(ok ? "Tracking link copied." : "Could not copy link.");

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

  if (!isPro) {
    setCostUpdateError(
      "Editing campaign costs over time is available in Pro Analytics.",
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
        data?.error || `Could not update campaign cost (${res.status})`,
      );
    }

    setCostUpdateStatus(
      data?.message ||
        "Campaign cost updated. Profit, ROI and ROAS were recalculated.",
    );

    navigate(location.pathname + location.search);
  } catch (error) {
    setCostUpdateError(
      error?.message || "Could not update campaign cost.",
    );
  } finally {
    setCostUpdating(false);
  }
}

  return (
 <Page
  title={campaign.name}
  subtitle={`Tracking performance · ${campaign.sourceType}`}
  backAction={{ content: "Dashboard", url: "/app" }}
>
  <Layout>
    <Layout.Section>
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" gap="400" wrap>
            <BlockStack gap="150">
              <Text as="p" tone="subdued">
                Shopify store: {campaign.shop}
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
                  {campaign.status}
                </Badge>

                <Badge>{campaign.sourceType}</Badge>

                <Badge tone={rankingTone}>
                  {campaign.performanceLabel}
                </Badge>

                <Badge tone={isPro ? "success" : getPlanTone(plan)}>
                  {plan?.label || "Free"}
                </Badge>
              </InlineStack>

              {campaign.rank ? (
                <Text as="p" tone="subdued">
                  Rank #{campaign.rank} of {campaign.totalRankedCampaigns}
                </Text>
              ) : (
                <Text as="p" tone="subdued">
                  Waiting for more data before ranking this campaign.
                </Text>
              )}
            </BlockStack>

            <BlockStack gap="150">
              <Button url={campaign.goUrl} external>
                Open tracking link
              </Button>

              <Button onClick={copyTrackingLink}>
                Copy tracking link
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
                Tracking link
              </Text>

              <Text as="p" tone="subdued">
                Customers who open this link are redirected to your destination
                URL. WhatSells uses the link to attribute clicks and orders to
                this campaign.
              </Text>

              <Text as="p">{campaign.goUrl}</Text>
            </BlockStack>
          </Card>

          <InlineStack gap="200" wrap>
            <Button
              variant={range === "live" ? "primary" : "secondary"}
              onClick={() => changeRange("live")}
            >
              Live
            </Button>

            <Button
              variant={range === "24h" ? "primary" : "secondary"}
              onClick={() => changeRange("24h")}
            >
              24h
            </Button>

            <Button
              variant={range === "7d" ? "primary" : "secondary"}
              onClick={() => changeRange("7d")}
            >
              7 days
            </Button>

            <Button
              variant={range === "30d" ? "primary" : "secondary"}
              onClick={() => changeRange("30d")}
            >
              30 days
            </Button>

            <Button
              variant={range === "all" ? "primary" : "secondary"}
              onClick={() => changeRange("all")}
            >
              All time
            </Button>
          </InlineStack>

          <Text as="p" tone="subdued">
            Current filter: {rangeLabel}
            {range === "live" ? " · auto refresh every 30 seconds" : ""}
          </Text>
        </BlockStack>
      </Card>
    </Layout.Section>

    <Layout.Section>
      <InlineStack gap="300" wrap>
        <KpiCard
          label="Clicks"
          value={String(rangeStats.clicks)}
          helpText={rangeLabel}
        />

        {isPro ? (
          <KpiCard
            label="Add-to-Carts"
            value={String(rangeStats.addToCarts)}
            helpText="Pro funnel signal"
            highlight
          />
        ) : null}

        <KpiCard
          label="Orders"
          value={String(rangeStats.orders)}
          helpText={rangeLabel}
        />

        <KpiCard
          label="Conversion"
          value={formatPercent(rangeStats.conversionRate)}
          helpText="Orders divided by clicks"
        />

        {isPro ? (
          <>
            <KpiCard
              label="Add-to-Cart Rate"
              value={formatPercent(rangeStats.addToCartRate)}
              helpText="Carts divided by clicks"
              highlight
            />

            <KpiCard
              label="Cart-to-Order"
              value={formatPercent(rangeStats.cartToOrderRate)}
              helpText="Orders divided by carts"
              highlight
            />
          </>
        ) : null}

        <KpiCard
          label="Revenue"
          value={formatMoneyFromCents(rangeStats.revenueCents)}
          helpText={rangeLabel}
        />

        <KpiCard
          label="Profit"
          value={formatMoneyFromCents(rangeStats.profitCents)}
          helpText="Revenue minus campaign cost"
        />

        <KpiCard
          label="ROI"
          value={formatPercent(rangeStats.roi)}
          helpText="Profit divided by cost"
        />

        <KpiCard
          label="ROAS"
          value={formatRatio(rangeStats.roas)}
          helpText="Revenue divided by cost"
        />
      </InlineStack>
    </Layout.Section>

    <Layout.Section>
      {isPro ? (
        <ProPanel>
          <BlockStack gap="300">
            <InlineStack gap="200" wrap>
              <Badge tone="success">Pro Analytics</Badge>

              <Text variant="headingMd" as="h2">
                Click → Add-to-Cart → Order funnel
              </Text>
            </InlineStack>

            <Text as="p" tone="subdued">
              Pro separates attention from intent. Clicks show traffic,
              add-to-carts show buying interest, and orders show final
              conversion.
            </Text>

            <InlineStack gap="300" wrap>
              <KpiCard
                label="Clicks"
                value={String(rangeStats.clicks)}
                helpText="Traffic"
                highlight
              />

              <KpiCard
                label="Add-to-Carts"
                value={String(rangeStats.addToCarts)}
                helpText="Buying intent"
                highlight
              />

              <KpiCard
                label="Orders"
                value={String(rangeStats.orders)}
                helpText="Final conversion"
                highlight
              />
            </InlineStack>
          </BlockStack>
        </ProPanel>
      ) : (
        <LockedProPanel plan={plan} />
      )}
    </Layout.Section>

    <Layout.Section>
      {isPro ? (
        <ProPanel>
          <BlockStack gap="300">
            <InlineStack gap="200" wrap>
              <Badge tone="success">Pro Cost Control</Badge>

              <Text variant="headingMd" as="h2">
                Adjust campaign costs over time
              </Text>
            </InlineStack>

            <Text as="p" tone="subdued">
              Update the campaign cost when TikTok, Meta, Google, influencer
              or offline printing costs change. WhatSells recalculates profit,
              ROI, ROAS and campaign diagnosis from the new cost.
            </Text>

            <InlineStack gap="300" wrap align="end">
              <div style={{ minWidth: 220 }}>
                <TextField
                  label="Campaign cost (€)"
                  value={costInput}
                  onChange={setCostInput}
                  autoComplete="off"
                  placeholder="e.g. 187,50"
                  helpText="Use the current total cost for this campaign."
                />
              </div>

              <Button
                variant="primary"
                onClick={updateCampaignCost}
                loading={costUpdating}
              >
                Update cost
              </Button>
            </InlineStack>

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

            <InlineStack gap="300" wrap>
              <KpiCard
                label="Current cost"
                value={formatMoneyFromCents(campaign.costCents || 0)}
                helpText="Used for profit, ROI and ROAS"
                highlight
              />

              <KpiCard
                label="Profit"
                value={formatMoneyFromCents(campaign.profitCents || 0)}
                helpText="Revenue minus campaign cost"
                highlight
              />

              <KpiCard
                label="ROI"
                value={formatPercent(campaign.roi)}
                helpText="Profit divided by cost"
                highlight
              />

              <KpiCard
                label="ROAS"
                value={formatRatio(campaign.roas)}
                helpText="Revenue divided by cost"
                highlight
              />
            </InlineStack>
          </BlockStack>
        </ProPanel>
      ) : (
        <Banner tone="info">
          <BlockStack gap="200">
            <InlineStack gap="200" wrap>
              <Badge tone="attention">Pro Cost Control locked</Badge>

              <Text as="p" fontWeight="semibold">
                Adjust campaign costs over time with Pro Analytics.
              </Text>
            </InlineStack>

            <Text as="p">
              Your current plan uses the campaign cost entered at creation.
              Pro lets you update costs later when ads keep spending or offline
              material gets printed again.
            </Text>

            {plan?.proUrl || plan?.upgradeUrl ? (
              <Button
                variant="primary"
                onClick={() => {
                  window.open(plan.proUrl || plan.upgradeUrl, "_top");
                }}
              >
                Upgrade to Pro Analytics
              </Button>
            ) : null}
          </BlockStack>
        </Banner>
      )}
    </Layout.Section>

    <Layout.Section>
      <Banner tone={campaignInsight.tone}>
        <BlockStack gap="100">
          <Text variant="headingSm" as="h2">
            {isPro ? "Pro campaign diagnosis" : "Campaign insight"}:{" "}
            {campaignInsight.title}
          </Text>

          <Text as="p">{campaignInsight.message}</Text>
        </BlockStack>
      </Banner>
    </Layout.Section>

    <Layout.Section>
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" gap="300" wrap>
            <BlockStack gap="100">
              <Text variant="headingMd" as="h2">
                {getMetricLabel(metric)} over time
              </Text>

              <Text as="p" tone="subdued">
                {rangeLabel}
              </Text>
            </BlockStack>

            <InlineStack gap="200" wrap>
              <MetricButton
                active={metric === "clicks"}
                onClick={() => setMetric("clicks")}
              >
                Clicks
              </MetricButton>

              {isPro ? (
                <MetricButton
                  active={metric === "addToCarts"}
                  onClick={() => setMetric("addToCarts")}
                >
                  Add-to-Carts
                </MetricButton>
              ) : null}

              <MetricButton
                active={metric === "orders"}
                onClick={() => setMetric("orders")}
              >
                Orders
              </MetricButton>

              <MetricButton
                active={metric === "revenueCents"}
                onClick={() => setMetric("revenueCents")}
              >
                Revenue
              </MetricButton>

              <MetricButton
                active={metric === "profitCents"}
                onClick={() => setMetric("profitCents")}
              >
                Profit
              </MetricButton>
            </InlineStack>
          </InlineStack>

          <CampaignPerformanceChart
            data={chartRows}
            metric={metric}
            bucket={bucket}
          />
        </BlockStack>
      </Card>
    </Layout.Section>

    <Layout.Section>
      <ChartTable rows={chartRows} showProColumns={isPro} />
    </Layout.Section>

    <Layout.Section>
      <Card>
        <BlockStack gap="300">
          <BlockStack gap="100">
            <Text variant="headingMd" as="h2">
              Attributed orders
            </Text>

            <Text as="p" tone="subdued">
              Orders tracked through this campaign link.
            </Text>
          </BlockStack>

          <DataTable
            columnContentTypes={["text", "text", "text", "text"]}
            headings={["Time", "Order", "Revenue", "Currency"]}
            rows={
              attributedOrderRows.length
                ? attributedOrderRows
                : [
                    [
                      "No attributed orders yet",
                      "Orders appear here after checkout through a WhatSells tracking link",
                      "—",
                      "—",
                    ],
                  ]
            }
          />
        </BlockStack>
      </Card>
    </Layout.Section>

    <Layout.Section>
      <Card>
        <BlockStack gap="300">
          <Text variant="headingMd" as="h2">
            Recent tracking events
          </Text>

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
              "Time",
              "Type",
              "Referer",
              "Language",
              "Order",
              "Value",
            ]}
            rows={
              eventRows.length
                ? eventRows
                : [["—", "—", "—", "—", "—", "—"]]
            }
          />
        </BlockStack>
      </Card>
    </Layout.Section>

    <Layout.Section>
      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">
            Campaign information
          </Text>
              <DataTable
                columnContentTypes={["text", "text"]}
                headings={["Metric", "Value"]}
                rows={[
                  ["Plan", plan?.label || "Free"],
                  ["Clicks last 7 days", String(campaign.clicks7d ?? 0)],
                  ["Clicks last 30 days", String(campaign.clicks30d ?? 0)],
                  ...(isPro
                    ? [
                        [
                          "Add-to-Carts last 7 days",
                          String(campaign.addToCarts7d ?? 0),
                        ],
                        [
                          "Add-to-Carts last 30 days",
                          String(campaign.addToCarts30d ?? 0),
                        ],
                      ]
                    : []),
                  ["Clicks", String(campaign.clicksCount ?? 0)],
                  ...(isPro
                    ? [
                        [
                          "Add-to-Carts",
                          String(campaign.addToCartCount ?? 0),
                        ],
                        [
                          "Add-to-Cart Rate",
                          formatPercent(campaign.addToCartRate),
                        ],
                        [
                          "Cart-to-Order Rate",
                          formatPercent(campaign.cartToOrderRate),
                        ],
                      ]
                    : []),
                  ["Orders", String(campaign.ordersCount ?? 0)],
                  ["Conversion", formatPercent(campaign.conversionRate)],
                  ["Revenue", formatMoneyFromCents(campaign.revenueCents || 0)],
                  ["Cost", formatMoneyFromCents(campaign.costCents || 0)],
                  ["Profit", formatMoneyFromCents(campaign.profitCents || 0)],
                  ["ROI", formatPercent(campaign.roi)],
                  ["ROAS", formatRatio(campaign.roas)],
                  [
                    "Break-even orders",
                    campaign.breakEvenOrders != null
                      ? String(campaign.breakEvenOrders)
                      : "—",
                  ],
                  ["Created", formatDateTime(campaign.createdAt)],
                  ["Updated", formatDateTime(campaign.updatedAt)],
                  ["Destination URL", campaign.targetUrl || "—"],
                  ["Public token", campaign.publicToken || "—"],
                  ["Tracking link", campaign.goUrl],
                  ["Notes", campaign.notes || "—"],
                ]}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}