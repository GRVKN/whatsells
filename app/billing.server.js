// app/billing.server.js

const APP_HANDLE = process.env.SHOPIFY_APP_HANDLE || "whatsells-1";
const PRO_PLAN_HANDLE = process.env.SHOPIFY_PRO_PLAN_HANDLE || "pro";
const APP_GID = process.env.SHOPIFY_APP_GID || "";
const PARTNER_API_TOKEN = process.env.SHOPIFY_PARTNER_API_TOKEN || "";
const PARTNER_ORG_ID = process.env.SHOPIFY_PARTNER_ORG_ID || "";
const PARTNER_API_VERSION = process.env.SHOPIFY_PARTNER_API_VERSION || "2026-04";

function getStoreHandle(shop) {
  return String(shop || "")
    .replace(/^https?:\/\//, "")
    .replace(".myshopify.com", "")
    .split("/")[0]
    .trim();
}

function normalizePlanHandle(value) {
  return String(value || "").trim().toLowerCase();
}

function isActiveStatus(status) {
  return String(status || "").trim().toUpperCase() === "ACTIVE";
}

function getPartnerApiUrl() {
  if (!PARTNER_ORG_ID) {
    return "";
  }

  return `https://partners.shopify.com/${PARTNER_ORG_ID}/api/${PARTNER_API_VERSION}/graphql.json`;
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
  if (!admin) {
    return null;
  }

  try {
    const response = await admin.graphql(`
      query GetShopIdForBilling {
        shop {
          id
          myshopifyDomain
        }
      }
    `);

    const json = await response.json();

    if (json?.errors?.length) {
      console.error("Could not fetch shop gid", {
        errors: json.errors,
      });

      return null;
    }

    return json?.data?.shop?.id || null;
  } catch (error) {
    console.error("Admin GraphQL shop gid request failed", error);
    return null;
  }
}

function getActiveSubscriptionQuery() {
  return `
    query ActiveSubscription($appId: ID!, $shopId: ID!) {
      activeSubscription(appId: $appId, shopId: $shopId) {
        billingPeriod
        cancelAtEndOfCycle
        trialEndsAt
        legacySubscriptionId
        currentBillingCycle {
          startTime
          endTime
        }
        items {
          handle
          description
          price {
            amount
            currencyCode
          }
        }
      }
    }
  `;
}

async function parsePartnerResponse(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    console.error("Partner API did not return JSON", {
      status: response.status,
      contentType: response.headers.get("content-type"),
      bodyPreview: text.slice(0, 500),
    });

    return null;
  }
}

async function fetchActiveSubscription({ appGid, shopGid }) {
  const partnerApiUrl = getPartnerApiUrl();

  if (!PARTNER_API_TOKEN || !PARTNER_ORG_ID || !partnerApiUrl || !appGid || !shopGid) {
    console.log("Partner API billing check skipped", {
      hasPartnerToken: Boolean(PARTNER_API_TOKEN),
      hasPartnerOrgId: Boolean(PARTNER_ORG_ID),
      hasAppGid: Boolean(appGid),
      hasShopGid: Boolean(shopGid),
    });

    return null;
  }

  try {
    const response = await fetch(partnerApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": PARTNER_API_TOKEN,
      },
      body: JSON.stringify({
        query: getActiveSubscriptionQuery(),
        variables: {
          appId: appGid,
          shopId: shopGid,
        },
      }),
    });

    const json = await parsePartnerResponse(response);

    if (!json) {
      return null;
    }

    if (!response.ok || json?.errors?.length) {
      console.error("Partner API activeSubscription failed", {
        status: response.status,
        errors: json?.errors,
      });

      return null;
    }

    return json?.data?.activeSubscription || null;
  } catch (error) {
    console.error("Partner API activeSubscription request failed", error);
    return null;
  }
}

function isProSubscription(activeSubscription) {
  if (!activeSubscription) {
    return false;
  }

  const items = Array.isArray(activeSubscription.items)
    ? activeSubscription.items
    : [];

  return items.some((item) => {
    const handle = item?.handle;
    return normalizePlanHandle(handle) === normalizePlanHandle(PRO_PLAN_HANDLE);
  });
}

export async function getShopPlan({ shop, admin }) {
  const upgradeUrl = getPricingPlansUrl(shop);
  const proUrl = getProPlanUrl(shop);

  const fallback = {
    plan: "free",
    isPro: false,
    upgradeUrl,
    proUrl,
    subscription: null,
    reason: "fallback_free",
  };

  try {
    if (!admin) {
      return {
        ...fallback,
        reason: "missing_admin_client",
      };
    }

    if (!APP_GID) {
      return {
        ...fallback,
        reason: "missing_app_gid",
      };
    }

    if (!PARTNER_API_TOKEN) {
      return {
        ...fallback,
        reason: "missing_partner_api_token",
      };
    }

    if (!PARTNER_ORG_ID) {
      return {
        ...fallback,
        reason: "missing_partner_org_id",
      };
    }

    const shopGid = await fetchShopGid(admin);

    if (!shopGid) {
      return {
        ...fallback,
        reason: "missing_shop_gid",
      };
    }

    const activeSubscription = await fetchActiveSubscription({
      appGid: APP_GID,
      shopGid,
    });

    const isPro = isProSubscription(activeSubscription);

    const result = {
      plan: isPro ? "pro" : "free",
      isPro,
      upgradeUrl,
      proUrl,
      subscription: activeSubscription,
      reason: activeSubscription ? "subscription_checked" : "no_subscription",
    };

    console.log("Billing plan checked", {
      shop,
      shopGid,
      plan: result.plan,
      isPro: result.isPro,
      reason: result.reason,
subscriptionItems:
  activeSubscription?.items?.map((item) => ({
    handle: item?.handle || null,
    description: item?.description || null,
    price: item?.price
      ? `${item.price.amount} ${item.price.currencyCode}`
      : null,
  })) || [],
    });

    return result;
  } catch (error) {
    console.error("Could not check shop billing plan", error);
    return fallback;
  }
}