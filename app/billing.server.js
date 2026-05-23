// app/billing.server.js

const APP_HANDLE = process.env.SHOPIFY_APP_HANDLE || "whatsells-1";
const PRO_PLAN_HANDLE = process.env.SHOPIFY_PRO_PLAN_HANDLE || "pro";
const APP_GID = process.env.SHOPIFY_APP_GID || "";
const PARTNER_API_TOKEN = process.env.SHOPIFY_PARTNER_API_TOKEN || "";

function getStoreHandle(shop) {
  return String(shop || "")
    .replace(/^https?:\/\//, "")
    .replace(".myshopify.com", "")
    .split("/")[0]
    .trim();
}

export function getPricingPlansUrl(shop) {
  const storeHandle = getStoreHandle(shop);

  if (!storeHandle) {
    return "https://admin.shopify.com";
  }

  return `https://admin.shopify.com/store/${storeHandle}/charges/${APP_HANDLE}/pricing_plans`;
}

export function getProPlanUrl(shop) {
  const storeHandle = getStoreHandle(shop);

  if (!storeHandle) {
    return "https://admin.shopify.com";
  }

  return `https://admin.shopify.com/store/${storeHandle}/charges/${APP_HANDLE}/plans/${PRO_PLAN_HANDLE}`;
}

async function fetchShopGid(admin) {
  const response = await admin.graphql(`
    query GetShopIdForBilling {
      shop {
        id
        myshopifyDomain
      }
    }
  `);

  const json = await response.json();
  return json?.data?.shop?.id || null;
}

async function fetchActiveSubscription({ appGid, shopGid }) {
  if (!PARTNER_API_TOKEN || !appGid || !shopGid) {
    return null;
  }

  const response = await fetch("https://partners.shopify.com/api/2026-07/graphql.json", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": PARTNER_API_TOKEN,
    },
    body: JSON.stringify({
      query: `
        query ActiveSubscription($appId: ID!, $shopId: ID!) {
          activeSubscription(appId: $appId, shopId: $shopId) {
            id
            name
            status
            plan {
              name
              handle
            }
          }
        }
      `,
      variables: {
        appId: appGid,
        shopId: shopGid,
      },
    }),
  });

  const json = await response.json();

  if (!response.ok || json?.errors?.length) {
    console.error("Partner API activeSubscription failed", {
      status: response.status,
      errors: json?.errors,
    });

    return null;
  }

  return json?.data?.activeSubscription || null;
}

export async function getShopPlan({ shop, admin }) {
  const fallback = {
    plan: "free",
    isPro: false,
    upgradeUrl: getPricingPlansUrl(shop),
    proUrl: getProPlanUrl(shop),
    reason: "fallback_free",
  };

  try {
    if (!admin || !APP_GID || !PARTNER_API_TOKEN) {
      return fallback;
    }

    const shopGid = await fetchShopGid(admin);

    if (!shopGid) {
      return fallback;
    }

    const activeSubscription = await fetchActiveSubscription({
      appGid: APP_GID,
      shopGid,
    });

    const handle = activeSubscription?.plan?.handle;
    const status = activeSubscription?.status;

    const isPro =
      status === "ACTIVE" &&
      String(handle || "").toLowerCase() === PRO_PLAN_HANDLE.toLowerCase();

    return {
      plan: isPro ? "pro" : "free",
      isPro,
      upgradeUrl: getPricingPlansUrl(shop),
      proUrl: getProPlanUrl(shop),
      subscription: activeSubscription,
      reason: activeSubscription ? "subscription_checked" : "no_subscription",
    };
  } catch (error) {
    console.error("Could not check shop billing plan", error);
    return fallback;
  }
}