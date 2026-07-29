// app/billing.server.js

import db from "./db.server";
import {
  formatSubscriptionPrice,
  getActiveSubscriptionQuery,
  getSubscriptionItems,
  hasSubscriptionPlan,
  resolveManagedPricingApiVersion,
} from "./billing-partner";
import { normalizePlanKey } from "./plans";

const APP_HANDLE = process.env.SHOPIFY_APP_HANDLE || "whatsells-1";

const BASIC_PLAN_HANDLE = process.env.SHOPIFY_BASIC_PLAN_HANDLE || "basic";
const PRO_PLAN_HANDLE = process.env.SHOPIFY_PRO_PLAN_HANDLE || "pro";
const EXPERT_PLAN_HANDLE = process.env.SHOPIFY_EXPERT_PLAN_HANDLE || "expert";

const APP_GID = process.env.SHOPIFY_APP_GID || "";
const PARTNER_API_TOKEN = process.env.SHOPIFY_PARTNER_API_TOKEN || "";
const PARTNER_ORG_ID = process.env.SHOPIFY_PARTNER_ORG_ID || "";
const PARTNER_API_VERSION = resolveManagedPricingApiVersion(
  process.env.SHOPIFY_PARTNER_API_VERSION,
);

function getStoreHandle(shop) {
  return String(shop || "")
    .replace(/^https?:\/\//, "")
    .replace(".myshopify.com", "")
    .split("/")[0]
    .trim();
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

export function getBasicPlanUrl(shop) {
  const storeHandle = getStoreHandle(shop);

  if (!storeHandle) {
    return "https://admin.shopify.com";
  }

  return `https://admin.shopify.com/store/${storeHandle}/charges/${APP_HANDLE}/plans/${BASIC_PLAN_HANDLE}`;
}

export function getProPlanUrl(shop) {
  const storeHandle = getStoreHandle(shop);

  if (!storeHandle) {
    return "https://admin.shopify.com";
  }

  return `https://admin.shopify.com/store/${storeHandle}/charges/${APP_HANDLE}/plans/${PRO_PLAN_HANDLE}`;
}

export function getExpertPlanUrl(shop) {
  const storeHandle = getStoreHandle(shop);

  if (!storeHandle) {
    return "https://admin.shopify.com";
  }

  return `https://admin.shopify.com/store/${storeHandle}/charges/${APP_HANDLE}/plans/${EXPERT_PLAN_HANDLE}`;
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

  if (
    !PARTNER_API_TOKEN ||
    !PARTNER_ORG_ID ||
    !partnerApiUrl ||
    !appGid ||
    !shopGid
  ) {
    console.log("Partner API billing check skipped", {
      hasPartnerToken: Boolean(PARTNER_API_TOKEN),
      hasPartnerOrgId: Boolean(PARTNER_ORG_ID),
      hasAppGid: Boolean(appGid),
      hasShopGid: Boolean(shopGid),
    });

    return {
      ok: false,
      activeSubscription: null,
      reason: "missing_partner_configuration",
    };
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
      return {
        ok: false,
        activeSubscription: null,
        reason: "invalid_partner_response",
      };
    }

    if (!response.ok || json?.errors?.length) {
      console.error("Partner API activeSubscription failed", {
        status: response.status,
        errors: json?.errors,
      });

      return {
        ok: false,
        activeSubscription: null,
        reason: "partner_api_error",
      };
    }

    return {
      ok: true,
      activeSubscription: json?.data?.activeSubscription || null,
      reason: json?.data?.activeSubscription
        ? "subscription_checked"
        : "no_subscription",
    };
  } catch (error) {
    console.error("Partner API activeSubscription request failed", error);
    return {
      ok: false,
      activeSubscription: null,
      reason: "partner_api_request_failed",
    };
  }
}

function isBasicSubscription(activeSubscription) {
  return hasSubscriptionPlan(activeSubscription, BASIC_PLAN_HANDLE);
}

function isProSubscription(activeSubscription) {
  return hasSubscriptionPlan(activeSubscription, PRO_PLAN_HANDLE);
}

function isExpertSubscription(activeSubscription) {
  return hasSubscriptionPlan(activeSubscription, EXPERT_PLAN_HANDLE);
}

function buildFallbackPlan({ shop, reason = "fallback_free" }) {
  const upgradeUrl = getPricingPlansUrl(shop);
  const basicUrl = getBasicPlanUrl(shop);
  const proUrl = getProPlanUrl(shop);
  const expertUrl = getExpertPlanUrl(shop);

  return {
    plan: "free",

    isFree: true,
    isBasic: false,
    isPro: false,
    isExpert: false,
    isPaid: false,

    hasBasic: false,
    hasPro: false,
    hasExpert: false,

    upgradeUrl,
    basicUrl,
    proUrl,
    expertUrl,

    basicPlanHandle: BASIC_PLAN_HANDLE,
    proPlanHandle: PRO_PLAN_HANDLE,
    expertPlanHandle: EXPERT_PLAN_HANDLE,

    subscription: null,
    subscriptionItems: [],

    reason,
  };
}

function buildPlanResult({ shop, activeSubscription, reason }) {
  const upgradeUrl = getPricingPlansUrl(shop);
  const basicUrl = getBasicPlanUrl(shop);
  const proUrl = getProPlanUrl(shop);
  const expertUrl = getExpertPlanUrl(shop);

  const isExpert = isExpertSubscription(activeSubscription);
  const isPro = !isExpert && isProSubscription(activeSubscription);
  const isBasic =
    !isExpert && !isPro && isBasicSubscription(activeSubscription);
  const isPaid = isBasic || isPro || isExpert;
  const isFree = !isPaid;

  let plan = "free";

  if (isExpert) {
    plan = "expert";
  } else if (isPro) {
    plan = "pro";
  } else if (isBasic) {
    plan = "basic";
  }

  const subscriptionItems = getSubscriptionItems(activeSubscription).map(
    (item) => ({
      handle: item?.handle || null,
      description: item?.description || null,
      price: formatSubscriptionPrice(item?.price),
    }),
  );

  return {
    plan,

    isFree,
    isBasic,
    isPro,
    isExpert,
    isPaid,

    hasBasic: isBasic || isPro || isExpert,
    hasPro: isPro || isExpert,
    hasExpert: isExpert,

    upgradeUrl,
    basicUrl,
    proUrl,
    expertUrl,

    basicPlanHandle: BASIC_PLAN_HANDLE,
    proPlanHandle: PRO_PLAN_HANDLE,
    expertPlanHandle: EXPERT_PLAN_HANDLE,

    subscription: activeSubscription,
    subscriptionItems,

    reason,
  };
}

async function persistPlanState(shop, plan) {
  const normalizedShop = String(shop || "").trim();
  if (!normalizedShop) return;

  const now = new Date();

  try {
    await db.shopPlanState.upsert({
      where: {
        shop: normalizedShop,
      },
      create: {
        shop: normalizedShop,
        plan: normalizePlanKey(plan),
        checkedAt: now,
        lastSuccessfulCheckAt: now,
      },
      update: {
        plan: normalizePlanKey(plan),
        checkedAt: now,
        lastSuccessfulCheckAt: now,
      },
    });
  } catch (error) {
    // Billing remains usable if the cache write fails. The public Pro tracker
    // fails closed until a later successful plan check repairs the snapshot.
    console.error("Could not persist billing plan state", {
      error,
      shop: normalizedShop,
    });
  }
}

export async function getCachedShopPlan(shop, { maxAgeHours = null } = {}) {
  const normalizedShop = String(shop || "").trim();
  if (!normalizedShop) return null;

  try {
    const cached = await db.shopPlanState.findUnique({
      where: {
        shop: normalizedShop,
      },
    });

    if (!cached) return null;

    if (maxAgeHours !== null) {
      const maxAgeMs = Math.max(Number(maxAgeHours) || 0, 0) * 60 * 60 * 1000;
      const checkedAtMs = new Date(cached.lastSuccessfulCheckAt).getTime();

      if (
        !Number.isFinite(checkedAtMs) ||
        Date.now() - checkedAtMs > maxAgeMs
      ) {
        return null;
      }
    }

    return {
      plan: normalizePlanKey(cached.plan),
      reason: "cached_subscription",
      checkedAt: cached.checkedAt,
      lastSuccessfulCheckAt: cached.lastSuccessfulCheckAt,
    };
  } catch (error) {
    console.error("Could not read cached billing plan state", {
      error,
      shop: normalizedShop,
    });

    return null;
  }
}

export async function getShopPlan({ shop, admin, requireLive = false }) {
  const fallback = buildFallbackPlan({ shop });

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

    const subscriptionCheck = await fetchActiveSubscription({
      appGid: APP_GID,
      shopGid,
    });

    if (!subscriptionCheck.ok) {
      if (requireLive) {
        return {
          ...fallback,
          reason: `${subscriptionCheck.reason}_live_check_required`,
        };
      }

      const cachedPlan = await getCachedShopPlan(shop, {
        maxAgeHours: 24,
      });

      if (cachedPlan) {
        const cachedResult = buildFallbackPlan({
          shop,
          reason: subscriptionCheck.reason,
        });

        return {
          ...cachedResult,
          plan: cachedPlan.plan,
          isFree: cachedPlan.plan === "free",
          isBasic: cachedPlan.plan === "basic",
          isPro: cachedPlan.plan === "pro",
          isExpert: cachedPlan.plan === "expert",
          isPaid: cachedPlan.plan !== "free",
          hasBasic: cachedPlan.plan !== "free",
          hasPro: cachedPlan.plan === "pro" || cachedPlan.plan === "expert",
          hasExpert: cachedPlan.plan === "expert",
          reason: `${subscriptionCheck.reason}_using_recent_cache`,
        };
      }

      return {
        ...fallback,
        reason: subscriptionCheck.reason,
      };
    }

    const result = buildPlanResult({
      shop,
      activeSubscription: subscriptionCheck.activeSubscription,
      reason: subscriptionCheck.reason,
    });

    await persistPlanState(shop, result.plan);

    console.log("Billing plan checked", {
      shop,
      shopGid,
      plan: result.plan,
      isFree: result.isFree,
      isBasic: result.isBasic,
      isPro: result.isPro,
      isExpert: result.isExpert,
      isPaid: result.isPaid,
      reason: result.reason,
      basicPlanHandle: result.basicPlanHandle,
      proPlanHandle: result.proPlanHandle,
      expertPlanHandle: result.expertPlanHandle,
      subscriptionItems: result.subscriptionItems,
    });

    return result;
  } catch (error) {
    console.error("Could not check shop billing plan", error);
    return fallback;
  }
}
