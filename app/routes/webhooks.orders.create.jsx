import db from "../db.server";
import { authenticate } from "../shopify.server";

const CAMPAIGN_PARAM = "ws_campaign";

function clean(value) {
  return String(value || "").trim();
}

function parseCampaignFromUrl(url) {
  const raw = clean(url);
  if (!raw) return null;

  try {
    const parsedUrl = new URL(raw);
    return clean(parsedUrl.searchParams.get(CAMPAIGN_PARAM)) || null;
  } catch {
    return null;
  }
}

function parseCampaignFromAttributes(attributes) {
  if (!Array.isArray(attributes)) return null;

  const match = attributes.find((item) => {
    const key = clean(item?.name || item?.key).toLowerCase();
    return key === CAMPAIGN_PARAM;
  });

  return clean(match?.value) || null;
}

function getCampaignToken(order) {
  return (
    parseCampaignFromAttributes(order?.note_attributes) ||
    parseCampaignFromAttributes(order?.customAttributes) ||
    parseCampaignFromUrl(order?.landing_site) ||
    parseCampaignFromUrl(order?.referring_site) ||
    null
  );
}

function parseMoneyToCents(value) {
  const normalized = String(value || "0")
    .replace(",", ".")
    .trim();
  const num = Number(normalized);

  if (!Number.isFinite(num) || num < 0) return 0;

  return Math.round(num * 100);
}

function getOrderId(order) {
  return clean(order?.admin_graphql_api_id) || clean(order?.id);
}

function getOrderName(order) {
  return clean(order?.name) || getOrderId(order);
}

export async function action({ request }) {
  let shop;
  let topic;
  let order;

  try {
    const authenticated = await authenticate.webhook(request);

    shop = authenticated.shop;
    topic = authenticated.topic;
    order = authenticated.payload;
  } catch (error) {
    console.error("orders/create webhook authentication failed:", error);
    return new Response("Webhook authentication failed", { status: 401 });
  }

  const orderId = getOrderId(order);
  const orderName = getOrderName(order);

  if (!orderId) {
    console.warn("orders/create webhook ignored: missing order id", {
      shop,
      topic,
    });

    return new Response("Missing order id", { status: 200 });
  }

  const token = getCampaignToken(order);

  if (!token) {
    console.warn("orders/create webhook ignored: no campaign token found", {
      shop,
      topic,
      orderId,
      orderName,
      landingSite: order?.landing_site || null,
      referringSite: order?.referring_site || null,
      noteAttributes: order?.note_attributes || [],
    });

    return new Response("No campaign token found", { status: 200 });
  }

  const campaign = await db.campaign.findFirst({
    where: {
      shop,
      publicToken: token,
    },
    select: {
      id: true,
      shop: true,
      publicToken: true,
    },
  });

  if (!campaign) {
    console.warn("orders/create webhook ignored: campaign not found", {
      shop,
      topic,
      orderId,
      orderName,
      token,
    });

    return new Response("Campaign not found", { status: 200 });
  }

  const alreadyTracked = await db.event.findFirst({
    where: {
      type: "purchase",
      orderId,
    },
    select: {
      id: true,
    },
  });

  if (alreadyTracked) {
    console.log("orders/create webhook ignored: duplicate purchase", {
      shop,
      orderId,
      orderName,
      token,
      campaignId: campaign.id,
    });

    return new Response("Duplicate ignored", { status: 200 });
  }

  const valueCents = parseMoneyToCents(
    order?.current_total_price || order?.total_price,
  );

  const currency =
    clean(order?.currency) || clean(order?.presentment_currency) || null;

  try {
    await db.$transaction([
      db.event.create({
        data: {
          campaignId: campaign.id,
          type: "purchase",
          orderId,
          originalValueCents: valueCents,
          valueCents,
          refundedCents: 0,
          currency,
          isCancelled: false,
        },
      }),

      db.campaign.update({
        where: {
          id: campaign.id,
        },
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
    // The partial unique index on purchase orderId is the final race-safe
    // guard. A pre-check alone cannot protect against two simultaneous webhook
    // deliveries.
    if (error?.code === "P2002") {
      console.log("orders/create webhook ignored: duplicate purchase race", {
        shop,
        orderId,
        orderName,
        token,
        campaignId: campaign.id,
      });

      return new Response("Duplicate ignored", { status: 200 });
    }

    console.error("orders/create webhook attribution failed:", {
      error,
      shop,
      topic,
      orderId,
      orderName,
      token,
      campaignId: campaign.id,
    });

    // Shopify should retry genuine infrastructure/database failures. Returning
    // 200 here would permanently lose the attribution.
    return new Response("Webhook attribution failed", { status: 500 });
  }

  console.log("orders/create attributed successfully:", {
    shop,
    topic,
    orderId,
    orderName,
    token,
    campaignId: campaign.id,
    valueCents,
    currency,
  });

  return new Response("OK", { status: 200 });
}
