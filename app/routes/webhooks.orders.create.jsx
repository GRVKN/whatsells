import db from "../db.server";
import { authenticate } from "../shopify.server";

const CAMPAIGN_PARAM = "ws_campaign";

function parseCampaignFromUrl(url) {
  if (!url) return null;

  try {
    const u = new URL(url);
    return u.searchParams.get(CAMPAIGN_PARAM);
  } catch {
    return null;
  }
}

function parseCampaignFromNoteAttributes(noteAttributes) {
  if (!Array.isArray(noteAttributes)) return null;

  const match = noteAttributes.find((item) => {
    const name = String(item?.name || "").trim().toLowerCase();
    return name === CAMPAIGN_PARAM;
  });

  const value = String(match?.value || "").trim();
  return value || null;
}

function getCampaignToken(order) {
  return (
    parseCampaignFromNoteAttributes(order?.note_attributes) ||
    parseCampaignFromUrl(order?.landing_site) ||
    parseCampaignFromUrl(order?.referring_site) ||
    null
  );
}

function parseMoneyToCents(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

export async function action({ request }) {
  const { shop, payload } = await authenticate.webhook(request);
  const order = payload;

  const orderId = String(order?.id || "");
  if (!orderId) {
    return new Response("Missing order id", { status: 200 });
  }

  const token = getCampaignToken(order);
  if (!token) {
    return new Response("No campaign token found", { status: 200 });
  }

  const campaign = await db.campaign.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      shop: true,
      status: true,
      publicToken: true,
    },
  });

  if (!campaign) {
    return new Response("Campaign not found", { status: 200 });
  }

  if (campaign.shop !== shop) {
    console.warn("Webhook campaign shop mismatch", {
      webhookShop: shop,
      campaignShop: campaign.shop,
      token,
    });
    return new Response("Campaign shop mismatch", { status: 200 });
  }

  if (campaign.status !== "active") {
    return new Response("Campaign inactive", { status: 200 });
  }

  const alreadyTracked = await db.event.findFirst({
    where: {
      type: "purchase",
      orderId,
    },
    select: { id: true },
  });

  if (alreadyTracked) {
    return new Response("Duplicate ignored", { status: 200 });
  }

  const valueCents = parseMoneyToCents(order?.total_price);
  const currency = String(order?.currency || "").trim() || null;

  try {
    await db.$transaction([
      db.event.create({
        data: {
          campaignId: campaign.id,
          type: "purchase",
          orderId,
          valueCents,
          currency,
        },
      }),

      db.campaign.update({
        where: { id: campaign.id },
        data: {
          revenueCents: {
            increment: valueCents,
          },
          ordersCount: {
            increment: 1,
          },
        },
      }),
    ]);
  } catch (error) {
    console.error("Webhook attribution failed", error);
    return new Response("Webhook attribution failed", { status: 200 });
  }

  return new Response("ok", { status: 200 });
}