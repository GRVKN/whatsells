import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteExpertAssets } from "../expert-storage.server";

function normalizeTopic(topic) {
  return String(topic || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "/");
}

function getOrderIdCandidates(payload) {
  const rawIds = Array.isArray(payload?.orders_to_redact)
    ? payload.orders_to_redact
    : [];
  const candidates = new Set();

  for (const rawId of rawIds) {
    const orderId = String(rawId || "").trim();
    if (!orderId) continue;

    candidates.add(orderId);

    if (!orderId.startsWith("gid://shopify/Order/")) {
      candidates.add(`gid://shopify/Order/${orderId}`);
    }
  }

  return [...candidates];
}

async function resyncPurchaseCounters(tx, campaignIds) {
  for (const campaignId of campaignIds) {
    const purchaseStats = await tx.event.aggregate({
      where: {
        campaignId,
        type: "purchase",
      },
      _count: {
        _all: true,
      },
      _sum: {
        valueCents: true,
        refundedCents: true,
      },
    });

    const cancelledOrdersCount = await tx.event.count({
      where: {
        campaignId,
        type: "purchase",
        isCancelled: true,
      },
    });

    await tx.campaign.updateMany({
      where: {
        id: campaignId,
      },
      data: {
        ordersCount: purchaseStats._count._all - cancelledOrdersCount,
        revenueCents: purchaseStats._sum.valueCents || 0,
        refundedCents: purchaseStats._sum.refundedCents || 0,
        cancelledOrdersCount,
      },
    });
  }
}

async function redactCustomerOrders(shop, payload) {
  const orderIds = getOrderIdCandidates(payload);
  if (!orderIds.length) return 0;

  return db.$transaction(async (tx) => {
    const events = await tx.event.findMany({
      where: {
        type: "purchase",
        orderId: {
          in: orderIds,
        },
        campaign: {
          shop,
        },
      },
      select: {
        id: true,
        campaignId: true,
      },
    });

    if (!events.length) return 0;

    await tx.event.deleteMany({
      where: {
        id: {
          in: events.map((event) => event.id),
        },
      },
    });

    const campaignIds = [...new Set(events.map((event) => event.campaignId))];

    await resyncPurchaseCounters(tx, campaignIds);
    await tx.expertSnapshot.deleteMany({
      where: {
        shop,
      },
    });

    return events.length;
  });
}

async function redactShop(shop) {
  const assets = await db.expertGeneratedAsset.findMany({
    where: { shop },
    select: {
      storagePath: true,
      sourceStoragePath: true,
    },
  });

  await deleteExpertAssets({
    paths: assets.flatMap((asset) => [
      asset.storagePath,
      asset.sourceStoragePath,
    ]),
  });

  await db.$transaction([
    db.expertGeneratedAsset.deleteMany({
      where: { shop },
    }),
    db.expertDecision.deleteMany({
      where: { shop },
    }),
    db.expertCampaignDraft.deleteMany({
      where: { shop },
    }),
    db.expertMessage.deleteMany({
      where: { shop },
    }),
    db.expertConversation.deleteMany({
      where: { shop },
    }),
    db.expertUsage.deleteMany({
      where: { shop },
    }),
    db.expertGoal.deleteMany({
      where: { shop },
    }),
    db.campaign.deleteMany({
      where: {
        shop,
      },
    }),
    db.session.deleteMany({
      where: {
        shop,
      },
    }),
    db.shopPlanState.deleteMany({
      where: {
        shop,
      },
    }),
    db.expertSnapshot.deleteMany({
      where: {
        shop,
      },
    }),
    db.trackedProduct.deleteMany({
      where: {
        shop,
      },
    }),
  ]);
}

export async function action({ request }) {
  let webhook;

  try {
    webhook = await authenticate.webhook(request);
  } catch (error) {
    console.error("Compliance webhook authentication failed", error);
    return new Response("Unauthorized", { status: 401 });
  }

  const { topic, shop, payload } = webhook;
  const normalizedTopic = normalizeTopic(topic);

  try {
    if (normalizedTopic === "customers/redact") {
      const deletedEvents = await redactCustomerOrders(shop, payload);

      console.log("customers/redact processed", {
        shop,
        deletedEvents,
      });
    } else if (normalizedTopic === "shop/redact") {
      await redactShop(shop);

      console.log("shop/redact processed", {
        shop,
      });
    } else if (normalizedTopic === "customers/data/request") {
      // WhatSells stores no customer profile, email or address. The only
      // customer-linked value is an order ID used for attribution; Shopify
      // supplies the relevant order IDs again if a later redaction is required.
      console.log("customers/data_request processed", {
        shop,
        requestedOrders: Array.isArray(payload?.orders_requested)
          ? payload.orders_requested.length
          : 0,
      });
    } else {
      console.warn("Unknown compliance topic acknowledged", {
        topic,
        shop,
      });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Compliance webhook processing failed", {
      error,
      topic,
      shop,
    });

    // Ask Shopify to retry instead of acknowledging a failed deletion.
    return new Response("Webhook processing failed", { status: 500 });
  }
}
