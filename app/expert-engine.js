const DAY_MS = 24 * 60 * 60 * 1000;

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(Math.max(numberOrZero(value), min), max);
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(numberOrZero(value) * factor) / factor;
}

function ratio(numerator, denominator) {
  const safeDenominator = numberOrZero(denominator);
  if (safeDenominator <= 0) return null;

  return numberOrZero(numerator) / safeDenominator;
}

function daysSince(value, now) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  if (!Number.isFinite(timestamp)) return 0;

  return Math.max(Math.floor((now.getTime() - timestamp) / DAY_MS), 0);
}

function getRecent(campaign, key) {
  return numberOrZero(campaign?.recent?.[key]);
}

function getConfidence(metrics) {
  const evidencePoints =
    numberOrZero(metrics.clicks30d) +
    numberOrZero(metrics.addToCarts30d) * 4 +
    numberOrZero(metrics.orders30d) * 20;

  if (evidencePoints >= 180 || metrics.orders30d >= 6) {
    return { label: "High", score: 90 };
  }

  if (evidencePoints >= 50 || metrics.orders30d >= 2) {
    return { label: "Medium", score: 65 };
  }

  return { label: "Low", score: 35 };
}

function recentOrLifetime(metrics, recentKey, lifetimeKey) {
  const recentValue = Number(metrics?.[recentKey]);

  if (Number.isFinite(recentValue)) {
    return recentValue;
  }

  return numberOrZero(metrics?.[lifetimeKey]);
}

function calculateOpportunityScore(metrics) {
  const clicks = recentOrLifetime(metrics, "clicks30d", "clicks");
  const orders = recentOrLifetime(metrics, "orders30d", "orders");
  const addToCarts = recentOrLifetime(metrics, "addToCarts30d", "addToCarts");
  const revenueCents = numberOrZero(metrics.revenueCents);
  const costCents = numberOrZero(metrics.costCents);
  const refundedCents = numberOrZero(metrics.refundedCents);
  const conversionRate = ratio(orders, clicks) || 0;
  const addToCartRate = ratio(addToCarts, clicks) || 0;
  const resultCents = revenueCents - costCents;
  const roi = ratio(resultCents, costCents);
  const confidence = getConfidence(metrics);

  const evidenceScore = clamp(confidence.score * 0.25, 0, 22.5);
  const conversionScore = clamp((conversionRate / 0.05) * 25, 0, 25);
  const intentScore = clamp((addToCartRate / 0.1) * 12.5, 0, 12.5);
  const efficiencyScore =
    costCents > 0
      ? clamp(((numberOrZero(roi) + 0.5) / 2.5) * 25, 0, 25)
      : revenueCents > 0
        ? 16
        : 4;
  const momentumRatio = ratio(
    numberOrZero(metrics.clicks7d) - numberOrZero(metrics.clicksPrevious7d),
    Math.max(numberOrZero(metrics.clicksPrevious7d), 1),
  );
  const momentumScore = clamp(8 + numberOrZero(momentumRatio) * 8, 0, 16);
  const grossAttributedValue = revenueCents + refundedCents;
  const refundRate = ratio(refundedCents, grossAttributedValue) || 0;
  const refundPenalty = clamp(refundRate * 30, 0, 12);

  const score = clamp(
    evidenceScore +
      conversionScore +
      intentScore +
      efficiencyScore +
      momentumScore -
      refundPenalty,
  );

  return {
    score: Math.round(score),
    confidence: confidence.label,
    conversionRate: round(conversionRate, 4),
    addToCartRate: round(addToCartRate, 4),
    roi: roi === null ? null : round(roi, 4),
    resultCents,
  };
}

function scoreCampaign(campaign) {
  const metrics = {
    clicks: numberOrZero(campaign.clicksCount),
    addToCarts: numberOrZero(campaign.addToCartCount),
    orders: numberOrZero(campaign.ordersCount),
    revenueCents: numberOrZero(campaign.revenueCents),
    refundedCents: numberOrZero(campaign.refundedCents),
    costCents: numberOrZero(campaign.costCents),
    clicks7d: getRecent(campaign, "clicks7d"),
    clicksPrevious7d: getRecent(campaign, "clicksPrevious7d"),
    clicks30d: getRecent(campaign, "clicks30d"),
    addToCarts30d: getRecent(campaign, "addToCarts30d"),
    orders30d: getRecent(campaign, "orders30d"),
    revenue30dCents: getRecent(campaign, "revenue30dCents"),
  };
  const opportunity = calculateOpportunityScore(metrics);

  return {
    id: campaign.id,
    name: campaign.name,
    sourceType: campaign.sourceType,
    status: campaign.status,
    productId: campaign.product?.id || null,
    productTitle: campaign.product?.title || null,
    ...metrics,
    ...opportunity,
  };
}

function aggregateProductScores(campaigns, campaignScores) {
  const campaignById = new Map(
    campaignScores.map((campaign) => [campaign.id, campaign]),
  );
  const products = new Map();

  for (const campaign of campaigns) {
    if (!campaign.product?.id) continue;

    if (!products.has(campaign.product.id)) {
      products.set(campaign.product.id, {
        id: campaign.product.id,
        title: campaign.product.title,
        shopifyProductId: campaign.product.shopifyProductId,
        imageUrl: campaign.product.imageUrl || null,
        onlineStoreUrl: campaign.product.onlineStoreUrl || null,
        channels: new Set(),
        campaignIds: [],
        clicks: 0,
        addToCarts: 0,
        orders: 0,
        revenueCents: 0,
        refundedCents: 0,
        costCents: 0,
        clicks7d: 0,
        clicksPrevious7d: 0,
        clicks30d: 0,
        addToCarts30d: 0,
        orders30d: 0,
        revenue30dCents: 0,
      });
    }

    const product = products.get(campaign.product.id);
    const score = campaignById.get(campaign.id);
    if (!score) continue;

    product.channels.add(campaign.sourceType);
    product.campaignIds.push(campaign.id);

    for (const key of [
      "clicks",
      "addToCarts",
      "orders",
      "revenueCents",
      "refundedCents",
      "costCents",
      "clicks7d",
      "clicksPrevious7d",
      "clicks30d",
      "addToCarts30d",
      "orders30d",
      "revenue30dCents",
    ]) {
      product[key] += numberOrZero(score[key]);
    }
  }

  return [...products.values()]
    .map((product) => {
      const opportunity = calculateOpportunityScore(product);

      return {
        ...product,
        channels: [...product.channels],
        ...opportunity,
      };
    })
    .sort((left, right) => {
      const scoreDifference = right.score - left.score;
      if (scoreDifference) return scoreDifference;

      const resultDifference = right.resultCents - left.resultCents;
      if (resultDifference) return resultDifference;

      return left.title.localeCompare(right.title);
    })
    .map((product, index) => ({
      ...product,
      rank: index + 1,
    }));
}

function recommendation({
  key,
  priority,
  type,
  tone,
  scope,
  title,
  summary,
  rationale,
  nextStep,
  confidence,
  productId = null,
  campaignId = null,
  metrics = {},
}) {
  return {
    key,
    priority: clamp(priority),
    type,
    tone,
    scope,
    productId,
    campaignId,
    title,
    summary,
    rationale,
    nextStep,
    confidence,
    metrics,
  };
}

function campaignRecommendations(campaign, now) {
  const items = [];
  const ageDays = daysSince(campaign.createdAt, now);
  const clicks = numberOrZero(campaign.clicksCount);
  const carts = numberOrZero(campaign.addToCartCount);
  const orders = numberOrZero(campaign.ordersCount);
  const costCents = numberOrZero(campaign.costCents);
  const revenueCents = numberOrZero(campaign.revenueCents);
  const resultCents = revenueCents - costCents;
  const roi = ratio(resultCents, costCents);
  const clicks7d = getRecent(campaign, "clicks7d");
  const clicksPrevious7d = getRecent(campaign, "clicksPrevious7d");
  const clicks30d = getRecent(campaign, "clicks30d");
  const carts30d = getRecent(campaign, "addToCarts30d");
  const orders30d = getRecent(campaign, "orders30d");
  const conversionRate = clicks30d > 0 ? ratio(orders30d, clicks30d) || 0 : 0;
  const addToCartRate = clicks30d > 0 ? ratio(carts30d, clicks30d) || 0 : 0;
  const cartToOrderRate = carts30d > 0 ? ratio(orders30d, carts30d) || 0 : 0;
  const confidence = getConfidence({
    clicks30d,
    addToCarts30d: carts30d,
    orders30d,
  }).label;
  const common = {
    productId: campaign.product?.id || null,
    campaignId: campaign.id,
    confidence,
    metrics: {
      clicks,
      clicks7d,
      clicksPrevious7d,
      clicks30d,
      addToCarts: carts,
      addToCarts30d: carts30d,
      orders,
      orders30d,
      revenueCents,
      costCents,
      resultCents,
      roi: roi === null ? null : round(roi, 4),
      conversionRate: round(conversionRate, 4),
      addToCartRate: round(addToCartRate, 4),
      cartToOrderRate: round(cartToOrderRate, 4),
    },
  };

  if (campaign.status !== "active") {
    return items;
  }

  if (
    costCents > 0 &&
    ((clicks >= 100 && orders === 0) ||
      (clicks >= 60 && roi !== null && roi <= -0.3))
  ) {
    items.push(
      recommendation({
        ...common,
        key: `pause_or_rework:${campaign.id}`,
        priority: 96,
        type: "pause_or_rework",
        tone: "critical",
        scope: "campaign",
        title: `Protect budget on “${campaign.name}”`,
        summary:
          "This campaign has enough negative evidence to justify a pause or a controlled rework.",
        rationale:
          "Tracked cost is ahead of attributed value. Continuing unchanged risks adding more spend to the same weak path.",
        nextStep:
          "Pause external spend or distribution, check the offer and destination page, then relaunch as a small measured test. WhatSells will not change the budget automatically.",
      }),
    );
  }

  if (clicks30d >= 100 && addToCartRate < 0.03) {
    items.push(
      recommendation({
        ...common,
        key: `fix_product_page:${campaign.id}`,
        priority: 88,
        type: "fix_product_page",
        tone: "warning",
        scope: "campaign",
        title: `Improve the product path for “${campaign.name}”`,
        summary:
          "Traffic arrives, but too few visitors show buying intent by adding the product to cart.",
        rationale:
          "The click-to-cart step is the main visible leak. The ad may attract attention while the product page, offer or audience match fails to continue the sale.",
        nextStep:
          "Check message-to-page consistency, price clarity, delivery information and the first mobile screen before buying more traffic.",
      }),
    );
  }

  if (carts30d >= 10 && cartToOrderRate < 0.2) {
    items.push(
      recommendation({
        ...common,
        key: `fix_checkout:${campaign.id}`,
        priority: 86,
        type: "fix_checkout",
        tone: "warning",
        scope: "campaign",
        title: `Investigate checkout friction for “${campaign.name}”`,
        summary:
          "Visitors add the product to cart, but too few complete an attributed order.",
        rationale:
          "Buying intent exists. The larger loss happens after the cart step, where shipping cost, payment options, trust or checkout friction may matter.",
        nextStep:
          "Test checkout on mobile, review shipping surprises and payment methods, and compare the next measured period before changing the campaign creative.",
      }),
    );
  }

  if (
    orders >= 3 &&
    orders30d >= 2 &&
    clicks30d >= 30 &&
    roi !== null &&
    roi >= 0.5 &&
    conversionRate >= 0.02
  ) {
    items.push(
      recommendation({
        ...common,
        key: `scale_controlled:${campaign.id}`,
        priority: 82,
        type: "scale_controlled",
        tone: "success",
        scope: "campaign",
        title: `Scale “${campaign.name}” carefully`,
        summary:
          "The campaign combines attributed orders, positive campaign result and a useful conversion signal.",
        rationale:
          "This is stronger evidence than clicks alone. It is a candidate for more reach, but WhatSells cannot see product margin or every external ad-platform cost.",
        nextStep:
          "Increase distribution or budget only in a small controlled step, keep the same tracking link and compare the next period before scaling again.",
      }),
    );
  }

  if (
    clicksPrevious7d >= 20 &&
    clicks7d <= Math.floor(clicksPrevious7d * 0.6)
  ) {
    items.push(
      recommendation({
        ...common,
        key: `traffic_decline:${campaign.id}`,
        priority: 74,
        type: "traffic_decline",
        tone: "warning",
        scope: "campaign",
        title: `Traffic is falling for “${campaign.name}”`,
        summary:
          "Tracked visits in the last seven days are materially below the preceding seven-day period.",
        rationale:
          "The campaign may be losing reach, the QR placement may have ended or the creative may be tiring. A traffic decline alone does not prove the product is weak.",
        nextStep:
          "Check whether distribution changed, refresh the creative or placement if needed, and keep the same product comparison visible.",
      }),
    );
  }

  if (ageDays >= 7 && clicks30d < 30) {
    items.push(
      recommendation({
        ...common,
        key: `collect_data:${campaign.id}`,
        priority: 42,
        type: "collect_data",
        tone: "info",
        scope: "campaign",
        title: `Collect a clearer signal for “${campaign.name}”`,
        summary:
          "There is not enough recent tracked traffic for a reliable performance decision.",
        rationale:
          "Small samples can make one order or one refund look more important than it is.",
        nextStep:
          "Keep the campaign measurable, verify that the tracking link or QR code is actually distributed, and reassess after at least 30 tracked clicks.",
      }),
    );
  }

  return items;
}

function buildOverview(campaigns, productScores, campaignScores) {
  const totals = campaignScores.reduce(
    (sum, campaign) => ({
      clicks: sum.clicks + campaign.clicks,
      addToCarts: sum.addToCarts + campaign.addToCarts,
      orders: sum.orders + campaign.orders,
      revenueCents: sum.revenueCents + campaign.revenueCents,
      refundedCents: sum.refundedCents + campaign.refundedCents,
      costCents: sum.costCents + campaign.costCents,
      clicks30d: sum.clicks30d + campaign.clicks30d,
      orders30d: sum.orders30d + campaign.orders30d,
      revenue30dCents: sum.revenue30dCents + campaign.revenue30dCents,
    }),
    {
      clicks: 0,
      addToCarts: 0,
      orders: 0,
      revenueCents: 0,
      refundedCents: 0,
      costCents: 0,
      clicks30d: 0,
      orders30d: 0,
      revenue30dCents: 0,
    },
  );
  const resultCents = totals.revenueCents - totals.costCents;

  return {
    products: productScores.length,
    campaigns: campaigns.length,
    unassignedCampaigns: campaigns.filter((campaign) => !campaign.product?.id)
      .length,
    ...totals,
    resultCents,
    roi: ratio(resultCents, totals.costCents),
    conversionRate: ratio(totals.orders, totals.clicks),
  };
}

export function buildExpertAnalysis({
  campaigns = [],
  currency = "EUR",
  now = new Date(),
} = {}) {
  const safeCampaigns = Array.isArray(campaigns) ? campaigns : [];
  const campaignScores = safeCampaigns.map(scoreCampaign);
  const productScores = aggregateProductScores(safeCampaigns, campaignScores);
  const overview = buildOverview(safeCampaigns, productScores, campaignScores);
  const recommendations = [];

  if (!safeCampaigns.length) {
    recommendations.push(
      recommendation({
        key: "create_first_campaign",
        priority: 100,
        type: "create_first_campaign",
        tone: "info",
        scope: "shop",
        title: "Create the first measurable campaign",
        summary:
          "Expert needs at least one tracking link or QR campaign before it can compare real performance.",
        rationale:
          "Without tracked visits and attributed orders, any product or budget recommendation would be guesswork.",
        nextStep:
          "Choose a published Shopify product, create one campaign and distribute its WhatSells link or QR code.",
        confidence: "High",
      }),
    );
  }

  if (overview.unassignedCampaigns > 0) {
    recommendations.push(
      recommendation({
        key: "assign_legacy_campaigns",
        priority: 91,
        type: "assign_products",
        tone: "warning",
        scope: "shop",
        title: "Assign products to historical campaigns",
        summary: `${overview.unassignedCampaigns} campaign${
          overview.unassignedCampaigns === 1 ? "" : "s"
        } cannot contribute to product opportunities yet.`,
        rationale:
          "Product-level recommendations become stronger when every existing campaign is connected to the product it promoted.",
        nextStep:
          "Open the unassigned campaign group and choose the matching published Shopify product. Existing metrics stay unchanged.",
        confidence: "High",
        metrics: {
          unassignedCampaigns: overview.unassignedCampaigns,
        },
      }),
    );
  }

  for (const campaign of safeCampaigns) {
    recommendations.push(...campaignRecommendations(campaign, now));
  }

  const topProduct = productScores[0];
  if (
    topProduct &&
    topProduct.score >= 65 &&
    topProduct.confidence !== "Low" &&
    topProduct.orders >= 2
  ) {
    recommendations.push(
      recommendation({
        key: `prioritize_product:${topProduct.id}`,
        priority: 80,
        type: "prioritize_product",
        tone: "success",
        scope: "product",
        productId: topProduct.id,
        title: `Prioritize “${topProduct.title}”`,
        summary:
          "This product currently has the strongest combination of measured demand, efficiency and evidence quality.",
        rationale:
          "The Opportunity Score compares tracked behavior inside WhatSells. It does not include inventory, unit margin or external market demand.",
        nextStep:
          "Use this product as the first candidate for the next controlled channel test, then compare the new campaign under the same product.",
        confidence: topProduct.confidence,
        metrics: {
          score: topProduct.score,
          clicks: topProduct.clicks,
          orders: topProduct.orders,
          revenueCents: topProduct.revenueCents,
          costCents: topProduct.costCents,
          resultCents: topProduct.resultCents,
        },
      }),
    );
  }

  for (const product of productScores) {
    if (
      product.channels.length === 1 &&
      product.clicks >= 50 &&
      product.orders >= 1
    ) {
      recommendations.push(
        recommendation({
          key: `test_second_channel:${product.id}`,
          priority: 61,
          type: "test_second_channel",
          tone: "info",
          scope: "product",
          productId: product.id,
          title: `Test a second channel for “${product.title}”`,
          summary:
            "The product has a measurable signal, but it is currently dependent on one tracked channel.",
          rationale:
            "A second channel creates a real product-level comparison and reduces the risk of judging the product from one placement or audience.",
          nextStep:
            "Create one small campaign for a different channel and keep its link or QR code separate so the comparison stays clean.",
          confidence: product.confidence,
          metrics: {
            score: product.score,
            channels: product.channels.length,
            clicks: product.clicks,
            orders: product.orders,
          },
        }),
      );
    }
  }

  const uniqueRecommendations = [
    ...new Map(recommendations.map((item) => [item.key, item])).values(),
  ]
    .sort((left, right) => {
      const priorityDifference = right.priority - left.priority;
      if (priorityDifference) return priorityDifference;

      return left.key.localeCompare(right.key);
    })
    .slice(0, 8);

  if (!uniqueRecommendations.length && safeCampaigns.length) {
    uniqueRecommendations.push(
      recommendation({
        key: "keep_measuring",
        priority: 40,
        type: "keep_measuring",
        tone: "info",
        scope: "shop",
        title: "Keep the current tests measurable",
        summary:
          "No campaign currently crosses a reliable stop, fix or scale threshold.",
        rationale:
          "That is not a failure. It means the available WhatSells evidence does not justify a stronger action today.",
        nextStep:
          "Keep links and QR codes separated by channel, record campaign costs and review the next daily snapshot.",
        confidence: "Medium",
      }),
    );
  }

  const status =
    overview.clicks < 30 || overview.products === 0
      ? "insufficient_data"
      : "ready";

  return {
    version: 1,
    status,
    currency,
    generatedFor: now.toISOString(),
    overview,
    todayAction: uniqueRecommendations[0] || null,
    recommendations: uniqueRecommendations,
    productScores,
    campaignScores: campaignScores.sort((left, right) => {
      const scoreDifference = right.score - left.score;
      if (scoreDifference) return scoreDifference;

      return left.name.localeCompare(right.name);
    }),
    methodology: {
      scoreRange: "0-100",
      recentWindowDays: 30,
      trendComparison: "last 7 days versus the preceding 7 days",
      safeguards: [
        "Recommendations never change external ad budgets automatically.",
        "Campaign cost is lifetime cost because WhatSells has no cost-history ledger yet.",
        "Product margin, inventory and external market demand are not included.",
        "Low-volume recommendations are marked with low confidence.",
      ],
    },
  };
}

export function applyExpertNarrative(analysis, narrative) {
  if (!analysis || !narrative || typeof narrative !== "object") {
    return analysis;
  }

  const copies = new Map(
    (Array.isArray(narrative.recommendations) ? narrative.recommendations : [])
      .filter((item) => item?.key)
      .map((item) => [item.key, item]),
  );

  const recommendations = analysis.recommendations.map((item) => {
    const copy = copies.get(item.key);
    if (!copy) return item;

    return {
      ...item,
      summary:
        typeof copy.summary === "string" && copy.summary.trim()
          ? copy.summary.trim().slice(0, 500)
          : item.summary,
      rationale:
        typeof copy.rationale === "string" && copy.rationale.trim()
          ? copy.rationale.trim().slice(0, 700)
          : item.rationale,
      nextStep:
        typeof copy.nextStep === "string" && copy.nextStep.trim()
          ? copy.nextStep.trim().slice(0, 500)
          : item.nextStep,
    };
  });

  return {
    ...analysis,
    overviewSummary:
      typeof narrative.overviewSummary === "string"
        ? narrative.overviewSummary.trim().slice(0, 700)
        : null,
    recommendations,
    todayAction: recommendations[0] || null,
  };
}
