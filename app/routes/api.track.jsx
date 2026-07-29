// app/routes/api.track.jsx

import db from "../db.server";
import { getCachedShopPlan, getShopPlan } from "../billing.server";
import { getPlanCapabilities } from "../plans";
import { hashIp } from "../privacy.server";
import { unauthenticated } from "../shopify.server";

const ALLOWED_EVENT_TYPES = new Set(["add_to_cart"]);
const CAMPAIGN_PARAM = "ws_campaign";

function clean(value) {
  return String(value || "").trim();
}

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
      ...(init.headers || {}),
    },
  });
}

function getClientIp(request) {
  const xff = request.headers.get("x-forwarded-for");

  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return null;
}

function looksLikeBot(userAgent = "") {
  const ua = userAgent.toLowerCase();

  return (
    ua.includes("bot") ||
    ua.includes("spider") ||
    ua.includes("crawler") ||
    ua.includes("headless") ||
    ua.includes("lighthouse") ||
    ua.includes("prerender") ||
    ua.includes("preview")
  );
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function getCampaignTokenFromBody(body) {
  return (
    clean(body?.campaignToken) ||
    clean(body?.token) ||
    clean(body?.[CAMPAIGN_PARAM]) ||
    null
  );
}

function getEventTypeFromBody(body) {
  return clean(body?.type || body?.eventType).toLowerCase();
}

export async function loader() {
  return json(
    {
      ok: false,
      error: "Method not allowed",
    },
    { status: 405 },
  );
}

export async function action({ request }) {
  if (request.method.toUpperCase() === "OPTIONS") {
    return json({ ok: true });
  }

  if (request.method.toUpperCase() !== "POST") {
    return json(
      {
        ok: false,
        error: "Method not allowed",
      },
      { status: 405 },
    );
  }

  const userAgent = request.headers.get("user-agent") || "";
  const referer = request.headers.get("referer") || null;
  const lang = request.headers.get("accept-language") || null;
  const ip = getClientIp(request);

  if (looksLikeBot(userAgent)) {
    return json({
      ok: true,
      skipped: true,
      reason: "bot",
    });
  }

  const body = await readJsonBody(request);

  if (!body) {
    return json(
      {
        ok: false,
        error: "Invalid JSON body",
      },
      { status: 400 },
    );
  }

  const type = getEventTypeFromBody(body);
  const token = getCampaignTokenFromBody(body);

  if (!ALLOWED_EVENT_TYPES.has(type)) {
    return json(
      {
        ok: false,
        error: "Invalid event type",
      },
      { status: 400 },
    );
  }

  if (!token) {
    return json(
      {
        ok: false,
        error: "Missing campaign token",
      },
      { status: 400 },
    );
  }

  const campaign = await db.campaign.findFirst({
    where: {
      publicToken: token,
    },
    select: {
      id: true,
      shop: true,
      publicToken: true,
      status: true,
    },
  });

  if (!campaign) {
    return json(
      {
        ok: false,
        error: "Campaign not found",
      },
      { status: 404 },
    );
  }

  if (campaign.status !== "active") {
    return json(
      {
        ok: true,
        skipped: true,
        reason: "campaign_inactive",
      },
      { status: 200 },
    );
  }

  let campaignPlan = await getCachedShopPlan(campaign.shop, {
    maxAgeHours: 6,
  });

  if (!campaignPlan) {
    try {
      const { admin } = await unauthenticated.admin(campaign.shop);
      campaignPlan = await getShopPlan({
        shop: campaign.shop,
        admin,
      });
    } catch (error) {
      console.error("Could not refresh plan for public tracking", {
        error,
        shop: campaign.shop,
      });
    }
  }

  const capabilities = getPlanCapabilities(campaignPlan);

  if (!capabilities.canUseAddToCartTracking) {
    return json({
      ok: true,
      skipped: true,
      reason: "plan_not_entitled",
    });
  }

  const ipHash = hashIp(ip);
  const duplicateWindowStart = new Date(Date.now() - 3_000);

  const recentlyTracked = ipHash
    ? await db.event.findFirst({
        where: {
          campaignId: campaign.id,
          type: "add_to_cart",
          ipHash,
          userAgent: userAgent || null,
          referer,
          createdAt: {
            gte: duplicateWindowStart,
          },
        },
        select: {
          id: true,
        },
      })
    : null;

  if (recentlyTracked) {
    return json({
      ok: true,
      skipped: true,
      reason: "duplicate",
    });
  }

  try {
    await db.$transaction([
      db.event.create({
        data: {
          campaignId: campaign.id,
          type: "add_to_cart",
          userAgent: userAgent || null,
          referer,
          lang,
          ipHash,
        },
      }),

      db.campaign.update({
        where: {
          id: campaign.id,
        },
        data: {
          addToCartCount: {
            increment: 1,
          },
        },
      }),
    ]);

    return json({
      ok: true,
      eventType: "add_to_cart",
      campaignId: campaign.id,
    });
  } catch (error) {
    console.error("Could not create add_to_cart event:", {
      error,
      token,
      campaignId: campaign.id,
    });

    return json(
      {
        ok: false,
        error: "Could not track event",
      },
      { status: 500 },
    );
  }
}
