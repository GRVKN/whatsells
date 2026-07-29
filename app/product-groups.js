function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function matchesSearch(campaign, search) {
  if (!search) return true;

  const haystack = [
    campaign?.name,
    campaign?.notes,
    campaign?.sourceType,
    campaign?.product?.title,
    campaign?.product?.handle,
  ]
    .map((value) => clean(value).toLowerCase())
    .join(" ");

  return haystack.includes(search);
}

export function filterCampaigns(
  campaigns,
  { search = "", sourceType = "all", status = "all" } = {},
) {
  const normalizedSearch = clean(search).toLowerCase();

  return (Array.isArray(campaigns) ? campaigns : []).filter((campaign) => {
    if (
      sourceType !== "all" &&
      clean(campaign?.sourceType) !== clean(sourceType)
    ) {
      return false;
    }

    if (status !== "all" && clean(campaign?.status) !== clean(status)) {
      return false;
    }

    return matchesSearch(campaign, normalizedSearch);
  });
}

function aggregateCampaigns(campaigns) {
  const totals = campaigns.reduce(
    (sum, campaign) => ({
      clicksCount: sum.clicksCount + numberOrZero(campaign?.clicksCount),
      addToCartCount:
        sum.addToCartCount + numberOrZero(campaign?.addToCartCount),
      ordersCount: sum.ordersCount + numberOrZero(campaign?.ordersCount),
      revenueCents: sum.revenueCents + numberOrZero(campaign?.revenueCents),
      refundedCents: sum.refundedCents + numberOrZero(campaign?.refundedCents),
      costCents: sum.costCents + numberOrZero(campaign?.costCents),
    }),
    {
      clicksCount: 0,
      addToCartCount: 0,
      ordersCount: 0,
      revenueCents: 0,
      refundedCents: 0,
      costCents: 0,
    },
  );

  const resultCents = totals.revenueCents - totals.costCents;

  return {
    ...totals,
    resultCents,
    conversionRate:
      totals.clicksCount > 0 ? totals.ordersCount / totals.clicksCount : 0,
    roi: totals.costCents > 0 ? resultCents / totals.costCents : null,
  };
}

export function buildProductGroups(campaigns, filters = {}) {
  const filtered = filterCampaigns(campaigns, filters);
  const groups = new Map();

  for (const campaign of filtered) {
    const product = campaign?.product || null;
    const key = product?.id ? `product:${product.id}` : "unassigned";

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        product,
        campaigns: [],
      });
    }

    groups.get(key).campaigns.push(campaign);
  }

  const grouped = [...groups.values()]
    .map((group) => ({
      ...group,
      channels: [...new Set(group.campaigns.map((item) => item.sourceType))],
      totals: aggregateCampaigns(group.campaigns),
    }))
    .sort((left, right) => {
      if (!left.product) return 1;
      if (!right.product) return -1;

      const checks = [
        right.totals.resultCents - left.totals.resultCents,
        right.totals.revenueCents - left.totals.revenueCents,
        right.totals.ordersCount - left.totals.ordersCount,
        right.totals.clicksCount - left.totals.clicksCount,
      ];
      const performanceDifference =
        checks.find((difference) => difference !== 0) || 0;

      if (performanceDifference) return performanceDifference;

      return left.product.title.localeCompare(right.product.title);
    });

  const assignedProductCount = grouped.filter((group) => group.product).length;
  let assignedRank = 0;

  return grouped.map((group) => {
    if (!group.product) {
      return {
        ...group,
        rank: null,
        assignedProductCount,
        isTopProduct: false,
      };
    }

    assignedRank += 1;

    const hasPerformanceSignal =
      group.totals.clicksCount > 0 ||
      group.totals.ordersCount > 0 ||
      group.totals.revenueCents > 0 ||
      group.totals.costCents > 0;

    return {
      ...group,
      rank: assignedRank,
      assignedProductCount,
      isTopProduct:
        assignedRank === 1 && assignedProductCount > 1 && hasPerformanceSignal,
    };
  });
}
