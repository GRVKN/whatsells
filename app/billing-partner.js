export const MINIMUM_MANAGED_PRICING_API_VERSION = "2026-07";

function isQuarterlyApiVersion(value) {
  return /^\d{4}-(01|04|07|10)$/.test(value);
}

export function resolveManagedPricingApiVersion(configuredVersion) {
  const normalizedVersion = String(configuredVersion || "").trim();

  if (
    !isQuarterlyApiVersion(normalizedVersion) ||
    normalizedVersion < MINIMUM_MANAGED_PRICING_API_VERSION
  ) {
    return MINIMUM_MANAGED_PRICING_API_VERSION;
  }

  return normalizedVersion;
}

export function getActiveSubscriptionQuery() {
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
            __typename
            active
            currency
            ... on FlatRatePrice {
              amount
            }
          }
        }
      }
    }
  `;
}

export function getSubscriptionItems(activeSubscription) {
  if (!activeSubscription) {
    return [];
  }

  return Array.isArray(activeSubscription.items)
    ? activeSubscription.items
    : [];
}

function normalizePlanHandle(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function hasSubscriptionPlan(activeSubscription, planHandle) {
  const normalizedWantedHandle = normalizePlanHandle(planHandle);
  const items = getSubscriptionItems(activeSubscription);

  if (!normalizedWantedHandle || !items.length) {
    return false;
  }

  return items.some((item) => {
    const handle = normalizePlanHandle(item?.handle);
    return handle === normalizedWantedHandle;
  });
}

export function formatSubscriptionPrice(price) {
  if (!price) {
    return null;
  }

  const amount =
    price.amount === null || price.amount === undefined
      ? ""
      : String(price.amount);
  const currency = String(price.currency || price.currencyCode || "").trim();

  if (!amount || !currency) {
    return null;
  }

  return `${amount} ${currency}`;
}
