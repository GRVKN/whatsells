import db from "../db.server";
import { authenticate } from "../shopify.server";

const ALLOWED_SOURCE_TYPES = new Set([
  "qr",
  "link",
  "packaging",
  "flyer",
  "influencer",
  "event",
]);

const ALLOWED_STATUS = new Set(["active", "paused", "archived"]);

function cleanStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function cleanOptionalNotes(v) {
  const s = cleanStr(v);
  return s || null;
}

function normalizeUrl(input) {
  let url = input.trim();

  // Händler schreiben oft nur Domain
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  // Shopify Domains automatisch sichern
  if (url.includes(".myshopify.com") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  return url;
}

function parseOptionalUrl(v) {
  const s = cleanStr(v);
  if (!s) return { ok: true, value: null };

  const normalized = normalizeUrl(s);

  try {
    const u = new URL(normalized);

    if (!["http:", "https:"].includes(u.protocol)) {
      return {
        ok: false,
        error: "Target URL must start with http:// or https://",
      };
    }

    return { ok: true, value: u.toString() };

  } catch {
    return { ok: false, error: "Target URL is invalid" };
  }
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

function calcProfit(costCents, revenueCents) {
  return Number(revenueCents || 0) - Number(costCents || 0);
}

function calcRoas(costCents, revenueCents) {
  if (!costCents || costCents <= 0) return null;
  return Number(revenueCents || 0) / Number(costCents || 0);
}

function calcRoi(costCents, revenueCents) {
  if (!costCents || costCents <= 0) return null;
  const profitCents = calcProfit(costCents, revenueCents);
  return profitCents / Number(costCents || 0);
}

function calcConversionRate(clicks, orders) {
  if (!clicks || clicks <= 0) return 0;
  return Number(orders || 0) / Number(clicks || 0);
}

function calcAverageOrderValue(revenueCents, orders) {
  if (!orders || orders <= 0) return null;
  return Math.round(Number(revenueCents || 0) / Number(orders || 0));
}

function calcBreakEvenOrders(costCents, avgOrderValueCents) {
  if (!costCents || costCents <= 0) return 0;
  if (!avgOrderValueCents || avgOrderValueCents <= 0) return null;
  return Math.ceil(Number(costCents) / Number(avgOrderValueCents));
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

function enrichCampaign(campaign, clicks7dMap = {}, clicks30dMap = {}) {
  const profitCents = calcProfit(campaign.costCents, campaign.revenueCents);
  const averageOrderValueCents = calcAverageOrderValue(
    campaign.revenueCents,
    campaign.ordersCount,
  );

  return {
    ...campaign,
    profitCents,
    clicks7d: clicks7dMap[campaign.id] || 0,
    clicks30d: clicks30dMap[campaign.id] || 0,
    conversionRate: calcConversionRate(campaign.clicksCount, campaign.ordersCount),
    averageOrderValueCents,
    breakEvenOrders: calcBreakEvenOrders(
      campaign.costCents,
      averageOrderValueCents,
    ),
    roas: calcRoas(campaign.costCents, campaign.revenueCents),
    roi: calcRoi(campaign.costCents, campaign.revenueCents),
  };
}

const campaignSelect = {
  id: true,
  publicToken: true,
  name: true,
  sourceType: true,
  targetUrl: true,
  costCents: true,
  clicksCount: true,
  revenueCents: true,
  ordersCount: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};
// GET /api/campaigns
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const campaigns = await db.campaign.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    select: campaignSelect,
  });

  if (!campaigns.length) {
    return Response.json({ campaigns: [] });
  }

  const campaignIds = campaigns.map((campaign) => campaign.id);
  const { clicks7dMap, clicks30dMap } = await loadClickMaps(campaignIds);

  const enriched = campaigns.map((campaign) =>
    enrichCampaign(campaign, clicks7dMap, clicks30dMap),
  );

  return Response.json({ campaigns: enriched });
}

// POST /api/campaigns
async function handleCreateCampaign(request, shop) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = cleanStr(body?.name);
  const sourceType = cleanStr(body?.sourceType || "qr");
  const notes = cleanOptionalNotes(body?.notes);
  const status = cleanStr(body?.status || "active");

  const targetUrlParsed = parseOptionalUrl(body?.targetUrl);
  if (!targetUrlParsed.ok) {
    return Response.json({ error: targetUrlParsed.error }, { status: 400 });
  }
  const targetUrl = targetUrlParsed.value;

  const costCents = parseMoneyToCents(body?.cost, 0);

  if (!name) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  if (!ALLOWED_SOURCE_TYPES.has(sourceType)) {
    return Response.json({ error: "Invalid sourceType" }, { status: 400 });
  }

  if (!ALLOWED_STATUS.has(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
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
      { error: "Campaign name already exists (use a different name)." },
      { status: 409 },
    );
  }

  try {
    const campaign = await db.campaign.create({
      data: {
        shop,
        name,
        sourceType,
        targetUrl,
        costCents,
        notes,
        status,
      },
      select: campaignSelect,
    });

    return Response.json(
      { campaign: enrichCampaign(campaign) },
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
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  switch (request.method.toUpperCase()) {
    case "POST":
      return handleCreateCampaign(request, shop);

    case "DELETE":
      return handleDeleteCampaign(request, shop);

    default:
      return Response.json(
        { error: `Method ${request.method} not allowed` },
        { status: 405 },
      );
  }
}