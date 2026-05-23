// app/routes/go.$id.jsx
import db from "../db.server";
import crypto from "node:crypto";

const ATTR_COOKIE = "ws_cid";
const TARGET_PARAM = "ws_campaign";
const ATTR_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function shopToUrl(shop) {
  return shop ? `https://${shop}` : "https://shopify.com";
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

function isPreviewRequest(request) {
  const purpose = (
    request.headers.get("purpose") ||
    request.headers.get("sec-purpose") ||
    request.headers.get("x-purpose") ||
    ""
  ).toLowerCase();

  return purpose.includes("prefetch") || purpose.includes("preview");
}

function safeHttpUrl(url, fallback) {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fallback;
    }

    return parsed.toString();
  } catch {
    return fallback;
  }
}

function hashIp(ip) {
  if (!ip) return null;

  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function appendCampaignParam(url, campaignToken) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set(TARGET_PARAM, campaignToken);
    return parsed.toString();
  } catch {
    return url;
  }
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

function buildSetCookie(name, value) {
  const isProd = process.env.NODE_ENV === "production";

  return (
    `${name}=${encodeURIComponent(value)}; ` +
    `Max-Age=${ATTR_MAX_AGE}; ` +
    `Path=/; ` +
    `SameSite=Lax; ` +
    `HttpOnly; ` +
    `Priority=High;` +
    (isProd ? " Secure;" : "")
  );
}

async function trackClick({ campaign, request, targetUrl }) {
  const userAgent = request.headers.get("user-agent") || "";
  const referer = request.headers.get("referer") || null;
  const lang = request.headers.get("accept-language") || null;
  const ip = getClientIp(request);

  const bot = looksLikeBot(userAgent);
  const preview = isPreviewRequest(request);

  console.log("Tracking link opened", {
    campaignId: campaign.id,
    token: campaign.publicToken,
    bot,
    preview,
    targetUrl,
  });

  if (bot || preview) {
    console.log("Tracking click ignored", {
      campaignId: campaign.id,
      token: campaign.publicToken,
      reason: bot ? "bot" : "preview",
    });

    return;
  }

  try {
    await db.$transaction([
      db.event.create({
        data: {
          campaignId: campaign.id,
          type: "click",
          userAgent: userAgent || null,
          referer,
          lang,
          ipHash: hashIp(ip),
        },
      }),

      db.campaign.update({
        where: {
          id: campaign.id,
        },
        data: {
          clicksCount: {
            increment: 1,
          },
        },
      }),
    ]);

    console.log("Tracking click counted", {
      campaignId: campaign.id,
      token: campaign.publicToken,
    });
  } catch (error) {
    console.error("Could not create click event:", {
      error,
      campaignId: campaign.id,
      token: campaign.publicToken,
    });
  }
}

export async function loader({ request, params }) {
  const token = String(params.id || "").trim();

  if (!token) {
    return new Response("Missing campaign token", { status: 400 });
  }

  const campaign = await db.campaign.findUnique({
    where: {
      publicToken: token,
    },
    select: {
      id: true,
      publicToken: true,
      shop: true,
      targetUrl: true,
      status: true,
    },
  });

  if (!campaign) {
    return new Response("Campaign not found", { status: 404 });
  }

  if (campaign.status !== "active") {
    return new Response("Campaign is not active", { status: 410 });
  }

  const fallbackUrl = shopToUrl(campaign.shop);
  const baseTarget = safeHttpUrl(campaign.targetUrl || fallbackUrl, fallbackUrl);
  const targetUrl = appendCampaignParam(baseTarget, campaign.publicToken);

  await trackClick({
    campaign,
    request,
    targetUrl,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: targetUrl,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      "X-Robots-Tag": "noindex, nofollow",
      "Set-Cookie": buildSetCookie(ATTR_COOKIE, campaign.publicToken),
    },
  });
}