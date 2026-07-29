import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getShopPlan } from "../billing.server";
import { getShopCurrency } from "../shop-currency.server";
import {
  buildCampaignLimitMessage,
  getCampaignCostUpdateMode,
  getPlanCapabilities,
  getPlanLabel,
} from "../plans";
import { CAMPAIGN_SOURCE_KEYS } from "../campaign-sources";
import {
  buildTrackedProductUpsert,
  loadVerifiedShopifyProduct,
} from "../shopify-product.server";

const ALLOWED_SOURCE_TYPES = new Set(CAMPAIGN_SOURCE_KEYS);

const ALLOWED_STATUS = new Set(["active", "paused", "archived"]);

function cleanStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function cleanOptionalNotes(v) {
  const s = cleanStr(v);
  return s || null;
}

function parseMoneyToCents(v, defaultValue = 0) {
  if (v === null || v === undefined || v === "") return defaultValue;

  const normalized = String(v).replace(",", ".").trim();
  const num = Number(normalized);

  if (!Number.isFinite(num) || num < 0) return null;

  return Math.round(num * 100);
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function numberOrZero(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

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

  const profitCents = calcProfit(costCents, revenueCents);
  return profitCents / cost;
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

async function loadClickMaps(campaignIds) {
  if (!campaignIds.length) {
    return {
      clicks7dMap: {},
      clicks30dMap: {},
    };
  }

  const [clicks7dRaw, clicks30dRaw] = await Promise.all([
    db.event.groupBy({
      by: ["campaignId"],
      where: {
        campaignId: { in: campaignIds },
        type: "click",
        createdAt: { gte: daysAgo(7) },
      },
      _count: { _all: true },
    }),

    db.event.groupBy({
      by: ["campaignId"],
      where: {
        campaignId: { in: campaignIds },
        type: "click",
        createdAt: { gte: daysAgo(30) },
      },
      _count: { _all: true },
    }),
  ]);

  return {
    clicks7dMap: Object.fromEntries(
      clicks7dRaw.map((row) => [row.campaignId, row._count._all]),
    ),
    clicks30dMap: Object.fromEntries(
      clicks30dRaw.map((row) => [row.campaignId, row._count._all]),
    ),
  };
}

function enrichCampaign(
  campaign,
  capabilities,
  clicks7dMap = {},
  clicks30dMap = {},
) {
  const profitCents = calcProfit(campaign.costCents, campaign.revenueCents);

  const averageOrderValueCents = calcAverageOrderValue(
    campaign.revenueCents,
    campaign.ordersCount,
  );

  const clicks7d = clicks7dMap[campaign.id] || 0;
  const clicks30d = clicks30dMap[campaign.id] || 0;
  const addToCartCount = numberOrZero(campaign.addToCartCount);
  const hasBasicAnalytics = capabilities.canUseCostAnalytics;
  const hasProFunnel = capabilities.canUseAddToCartTracking;

  return {
    ...campaign,
    costCents: hasBasicAnalytics ? campaign.costCents : null,
    refundedCents: hasBasicAnalytics ? campaign.refundedCents : null,
    cancelledOrdersCount: hasBasicAnalytics
      ? campaign.cancelledOrdersCount
      : null,
    addToCartCount: hasProFunnel ? addToCartCount : null,
    profitCents: hasBasicAnalytics ? profitCents : null,
    clicks7d: capabilities.canUsePerformanceHistory ? clicks7d : null,
    clicks30d: capabilities.canUsePerformanceHistory ? clicks30d : null,
    conversionRate: calcConversionRate(
      campaign.clicksCount,
      campaign.ordersCount,
    ),
    addToCartRate: hasProFunnel
      ? calcAddToCartRate(campaign.clicksCount, addToCartCount)
      : null,
    cartToOrderRate: hasProFunnel
      ? calcCartToOrderRate(addToCartCount, campaign.ordersCount)
      : null,
    averageOrderValueCents: hasBasicAnalytics ? averageOrderValueCents : null,
    breakEvenOrders: hasBasicAnalytics
      ? calcBreakEvenOrders(campaign.costCents, averageOrderValueCents)
      : null,
    roas: hasBasicAnalytics
      ? calcRoas(campaign.costCents, campaign.revenueCents)
      : null,
    roi: hasBasicAnalytics
      ? calcRoi(campaign.costCents, campaign.revenueCents)
      : null,
  };
}

function hasPerformanceSignal(campaign) {
  return (
    numberOrZero(campaign.costCents) > 0 ||
    numberOrZero(campaign.revenueCents) > 0 ||
    numberOrZero(campaign.profitCents) !== 0 ||
    numberOrZero(campaign.ordersCount) > 0 ||
    numberOrZero(campaign.addToCartCount) > 0 ||
    numberOrZero(campaign.clicksCount) > 0 ||
    numberOrZero(campaign.clicks30d) > 0 ||
    numberOrZero(campaign.clicks7d) > 0
  );
}

function compareCampaignPerformance(a, b) {
  const checks = [
    numberOrZero(b.profitCents) - numberOrZero(a.profitCents),
    numberOrZero(b.roi) - numberOrZero(a.roi),
    numberOrZero(b.revenueCents) - numberOrZero(a.revenueCents),
    numberOrZero(b.ordersCount) - numberOrZero(a.ordersCount),
    numberOrZero(b.cartToOrderRate) - numberOrZero(a.cartToOrderRate),
    numberOrZero(b.addToCartRate) - numberOrZero(a.addToCartRate),
    numberOrZero(b.addToCartCount) - numberOrZero(a.addToCartCount),
    numberOrZero(b.conversionRate) - numberOrZero(a.conversionRate),
    numberOrZero(b.roas) - numberOrZero(a.roas),
    numberOrZero(b.clicks30d) - numberOrZero(a.clicks30d),
    numberOrZero(b.clicksCount) - numberOrZero(a.clicksCount),
    numberOrZero(a.costCents) - numberOrZero(b.costCents),
  ];

  return checks.find((value) => value !== 0) || 0;
}

function addCampaignRanking(campaigns) {
  const ranked = campaigns
    .filter(hasPerformanceSignal)
    .sort(compareCampaignPerformance);

  const totalRankedCampaigns = ranked.length;
  const rankById = new Map();

  ranked.forEach((campaign, index) => {
    rankById.set(campaign.id, index + 1);
  });

  return campaigns.map((campaign) => {
    const rank = rankById.get(campaign.id) || null;

    const isBestCampaign = rank === 1 && totalRankedCampaigns > 0;
    const isWorstCampaign =
      rank === totalRankedCampaigns && totalRankedCampaigns > 1;

    let performanceLabel = "Not ranked";

    if (isBestCampaign) {
      performanceLabel = "Best campaign";
    } else if (isWorstCampaign) {
      performanceLabel = "Worst campaign";
    } else if (rank) {
      performanceLabel = `Rank #${rank}`;
    }

    return {
      ...campaign,
      rank,
      totalRankedCampaigns,
      isBestCampaign,
      isWorstCampaign,
      performanceLabel,
    };
  });
}

const campaignSelect = {
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
      updatedAt: true,
    },
  },
};

// GET /api/campaigns
export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const [campaigns, campaignCount, plan, currency] = await Promise.all([
    db.campaign.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      select: campaignSelect,
    }),

    db.campaign.count({
      where: { shop },
    }),

    getShopPlan({ shop, admin }),

    getShopCurrency(admin),
  ]);

  const capabilities = getPlanCapabilities(plan, campaignCount);

  if (!campaigns.length) {
    return Response.json({
      campaigns: [],
      capabilities,
      currency,
      upgradeUrl: plan.upgradeUrl,
      basicUrl: plan.basicUrl,
      proUrl: plan.proUrl,
      expertUrl: plan.expertUrl,
    });
  }

  const campaignIds = campaigns.map((campaign) => campaign.id);
  const { clicks7dMap, clicks30dMap } = capabilities.canUsePerformanceHistory
    ? await loadClickMaps(campaignIds)
    : { clicks7dMap: {}, clicks30dMap: {} };

  const enriched = campaigns.map((campaign) =>
    enrichCampaign(campaign, capabilities, clicks7dMap, clicks30dMap),
  );

  const rankedCampaigns = capabilities.canUseCampaignComparison
    ? addCampaignRanking(enriched)
    : enriched.map((campaign) => ({
        ...campaign,
        rank: null,
        totalRankedCampaigns: null,
        isBestCampaign: false,
        isWorstCampaign: false,
        performanceLabel: null,
      }));

  return Response.json({
    campaigns: rankedCampaigns,
    capabilities,
    currency,
    upgradeUrl: plan.upgradeUrl,
    basicUrl: plan.basicUrl,
    proUrl: plan.proUrl,
    expertUrl: plan.expertUrl,
  });
}

// POST /api/campaigns
async function handleCreateCampaign(request, shop, admin) {
  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = cleanStr(body?.name);
  const sourceType = cleanStr(body?.sourceType || "qr");
  const shopifyProductId = cleanStr(body?.shopifyProductId);
  const notes = cleanOptionalNotes(body?.notes);
  const status = cleanStr(body?.status || "active");
  const costCents = parseMoneyToCents(body?.cost, 0);

  if (!name) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  if (name.length > 120) {
    return Response.json(
      { error: "Campaign name must be 120 characters or fewer" },
      { status: 400 },
    );
  }

  if (!ALLOWED_SOURCE_TYPES.has(sourceType)) {
    return Response.json({ error: "Invalid sourceType" }, { status: 400 });
  }

  if (!ALLOWED_STATUS.has(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  if (!shopifyProductId) {
    return Response.json(
      { error: "Choose the Shopify product this campaign promotes." },
      { status: 400 },
    );
  }

  if (costCents === null) {
    return Response.json({ error: "Invalid cost value" }, { status: 400 });
  }

  const existing = await db.campaign.findFirst({
    where: { shop, name },
    select: { id: true },
  });

  if (existing) {
    return Response.json(
      { error: "Campaign name already exists. Use a different name." },
      { status: 409 },
    );
  }

  const campaignCount = await db.campaign.count({
    where: { shop },
  });

  const plan = await getShopPlan({ shop, admin });
  const capabilities = getPlanCapabilities(plan, campaignCount);
  const campaignLimit = capabilities.campaignLimit;

  if (campaignLimit !== null && campaignCount >= campaignLimit) {
    return Response.json(
      {
        error: buildCampaignLimitMessage(plan),
        upgradeRequired: true,
        upgradeUrl: plan.upgradeUrl,
        basicUrl: plan.basicUrl,
        proUrl: plan.proUrl,
        expertUrl: plan.expertUrl,
        plan: getPlanLabel(plan),
        campaignLimit,
        campaignCount,
        remainingCampaigns: 0,
        ...capabilities,
      },
      { status: 403 },
    );
  }

  if (costCents > 0 && !capabilities.canUseCostAnalytics) {
    return Response.json(
      {
        error:
          "Campaign cost, campaign result, ROI and ROAS are available from the Basic plan.",
        upgradeRequired: true,
        requiredPlan: "Basic",
        upgradeUrl: plan.upgradeUrl,
        basicUrl: plan.basicUrl,
        proUrl: plan.proUrl,
        expertUrl: plan.expertUrl,
        ...capabilities,
      },
      { status: 403 },
    );
  }

  const selectedProduct = await loadVerifiedShopifyProduct(
    admin,
    shopifyProductId,
  );

  if (!selectedProduct.ok) {
    return Response.json(
      { error: selectedProduct.error },
      { status: selectedProduct.status },
    );
  }

  try {
    const nextCapabilities = getPlanCapabilities(plan, campaignCount + 1);
    const campaign = await db.$transaction(async (tx) => {
      const product = await tx.trackedProduct.upsert(
        buildTrackedProductUpsert({
          shop,
          product: selectedProduct.product,
        }),
      );

      return tx.campaign.create({
        data: {
          shop,
          name,
          sourceType,
          targetUrl: selectedProduct.product.onlineStoreUrl,
          costCents,
          notes,
          status,
          productId: product.id,
        },
        select: campaignSelect,
      });
    });

    return Response.json(
      {
        campaign: enrichCampaign(campaign, nextCapabilities),
        capabilities: nextCapabilities,
        upgradeUrl: plan.upgradeUrl,
        basicUrl: plan.basicUrl,
        proUrl: plan.proUrl,
        expertUrl: plan.expertUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Could not create campaign:", error);

    return Response.json(
      { error: "Could not create campaign." },
      { status: 500 },
    );
  }
}

async function assignCampaignProduct({ body, shop, admin }) {
  const id = cleanStr(body?.id);
  const shopifyProductId = cleanStr(body?.shopifyProductId);

  if (!id) {
    return Response.json({ error: "Campaign id is required" }, { status: 400 });
  }

  if (!shopifyProductId) {
    return Response.json(
      { error: "Choose the Shopify product this campaign promotes." },
      { status: 400 },
    );
  }

  const existing = await db.campaign.findFirst({
    where: { id, shop },
    select: { id: true },
  });

  if (!existing) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  const selectedProduct = await loadVerifiedShopifyProduct(
    admin,
    shopifyProductId,
  );

  if (!selectedProduct.ok) {
    return Response.json(
      { error: selectedProduct.error },
      { status: selectedProduct.status },
    );
  }

  try {
    const [plan, campaign] = await Promise.all([
      getShopPlan({ shop, admin }),
      db.$transaction(async (tx) => {
        const product = await tx.trackedProduct.upsert(
          buildTrackedProductUpsert({
            shop,
            product: selectedProduct.product,
          }),
        );

        return tx.campaign.update({
          where: { id: existing.id },
          data: {
            productId: product.id,
            targetUrl: selectedProduct.product.onlineStoreUrl,
          },
          select: campaignSelect,
        });
      }),
    ]);

    return Response.json({
      ok: true,
      campaign: enrichCampaign(campaign, getPlanCapabilities(plan)),
      message: `Campaign assigned to ${campaign.product.title}.`,
    });
  } catch (error) {
    console.error("Could not assign campaign to Shopify product", {
      error,
      shop,
      campaignId: id,
    });

    return Response.json(
      { error: "Could not assign this campaign to the selected product." },
      { status: 500 },
    );
  }
}

// PUT /api/campaigns
async function handleUpdateCampaign(request, shop, admin) {
  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (cleanStr(body?.operation) === "assign_product") {
    return assignCampaignProduct({ body, shop, admin });
  }

  const id = cleanStr(body?.id);
  const costCents = parseMoneyToCents(body?.cost, null);

  if (!id) {
    return Response.json({ error: "Campaign id is required" }, { status: 400 });
  }

  if (costCents === null) {
    return Response.json({ error: "Invalid cost value" }, { status: 400 });
  }

  const [plan, existing] = await Promise.all([
    getShopPlan({ shop, admin }),
    db.campaign.findFirst({
      where: { id, shop },
      select: { id: true, name: true, costCents: true },
    }),
  ]);
  const capabilities = getPlanCapabilities(plan);
  const costUpdateMode = getCampaignCostUpdateMode(plan, existing?.costCents);

  if (!existing) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (costUpdateMode === "locked") {
    return Response.json(
      {
        error: capabilities.canUseCostAnalytics
          ? "This campaign already has a cost. Changing it over time is available in Pro."
          : "Campaign cost and profitability analytics are available from Basic.",
        upgradeRequired: true,
        requiredPlan: capabilities.canUseCostAnalytics ? "Pro" : "Basic",
        upgradeUrl: plan.upgradeUrl,
        basicUrl: plan.basicUrl,
        proUrl: plan.proUrl,
        expertUrl: plan.expertUrl,
        plan: getPlanLabel(plan),
        ...capabilities,
      },
      { status: 403 },
    );
  }

  try {
    let campaign;

    if (costUpdateMode === "update") {
      campaign = await db.campaign.update({
        where: { id },
        data: {
          costCents,
        },
        select: campaignSelect,
      });
    } else {
      const result = await db.campaign.updateMany({
        where: {
          id,
          shop,
          costCents: 0,
        },
        data: {
          costCents,
        },
      });

      if (result.count !== 1) {
        return Response.json(
          {
            error:
              "The initial campaign cost was already set. Upgrade to Pro to change it again.",
            upgradeRequired: true,
            requiredPlan: "Pro",
            upgradeUrl: plan.upgradeUrl,
            proUrl: plan.proUrl,
            expertUrl: plan.expertUrl,
          },
          { status: 409 },
        );
      }

      campaign = await db.campaign.findUnique({
        where: { id },
        select: campaignSelect,
      });
    }

    return Response.json({
      ok: true,
      campaign: enrichCampaign(campaign, capabilities),
      message:
        costUpdateMode === "update"
          ? "Campaign cost updated. Campaign result, ROI and ROAS were recalculated."
          : "Initial campaign cost saved. Campaign result, ROI and ROAS are now available.",
    });
  } catch (error) {
    console.error("Could not update campaign cost:", {
      error,
      shop,
      campaignId: id,
    });

    return Response.json(
      { error: "Could not update campaign cost." },
      { status: 500 },
    );
  }
}
// DELETE /api/campaigns
async function handleDeleteCampaign(request, shop) {
  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = cleanStr(body?.id);

  if (!id) {
    return Response.json({ error: "Campaign id is required" }, { status: 400 });
  }

  const existing = await db.campaign.findFirst({
    where: { id, shop },
    select: { id: true, name: true },
  });

  if (!existing) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  try {
    await db.campaign.delete({
      where: { id },
    });

    return Response.json({
      ok: true,
      deletedId: existing.id,
      deletedName: existing.name,
    });
  } catch (error) {
    console.error("Could not delete campaign:", error);

    return Response.json(
      { error: "Could not delete campaign." },
      { status: 500 },
    );
  }
}

export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  switch (request.method.toUpperCase()) {
    case "POST":
      return handleCreateCampaign(request, shop, admin);

    case "PUT":
    case "PATCH":
      return handleUpdateCampaign(request, shop, admin);

    case "DELETE":
      return handleDeleteCampaign(request, shop);

    default:
      return Response.json(
        { error: `Method ${request.method} not allowed` },
        { status: 405 },
      );
  }
}
