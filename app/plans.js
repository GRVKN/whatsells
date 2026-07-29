export const PLAN_KEYS = Object.freeze({
  FREE: "free",
  BASIC: "basic",
  PRO: "pro",
  EXPERT: "expert",
});

export const FREE_CAMPAIGN_LIMIT = 3;
export const BASIC_CAMPAIGN_LIMIT = 20;
export const EXPERT_MONTHLY_PRICE_USD = 79;
export const EXPERT_TRIAL_DAYS = 14;
export const EXPERT_PRICE_LABEL = `$${EXPERT_MONTHLY_PRICE_USD} / month`;

export const PLAN_DEFINITIONS = Object.freeze({
  [PLAN_KEYS.FREE]: Object.freeze({
    key: PLAN_KEYS.FREE,
    label: "Free",
    campaignLimit: FREE_CAMPAIGN_LIMIT,
    summary: "Start tracking without risk",
    features: Object.freeze([
      "3 campaigns",
      "Tracking links and QR codes",
      "Clicks, orders and net revenue",
      "All-time conversion rate",
    ]),
  }),
  [PLAN_KEYS.BASIC]: Object.freeze({
    key: PLAN_KEYS.BASIC,
    label: "Basic",
    campaignLimit: BASIC_CAMPAIGN_LIMIT,
    summary: "Understand which campaigns pay off",
    features: Object.freeze([
      "20 campaigns",
      "Everything in Free",
      "Campaign result, ROI and ROAS",
      "Time-range charts and campaign ranking",
      "Order, refund and event details",
      "CSV campaign export",
    ]),
  }),
  [PLAN_KEYS.PRO]: Object.freeze({
    key: PLAN_KEYS.PRO,
    label: "Pro",
    campaignLimit: null,
    summary: "See the full conversion funnel",
    features: Object.freeze([
      "Unlimited campaigns",
      "Everything in Basic",
      "Click → Add-to-Cart → Order funnel",
      "Pro campaign diagnosis",
      "Update campaign costs over time",
    ]),
  }),
  [PLAN_KEYS.EXPERT]: Object.freeze({
    key: PLAN_KEYS.EXPERT,
    label: "Expert",
    campaignLimit: null,
    summary: "Know what to do next",
    features: Object.freeze([
      "Everything in Pro",
      "Daily action and campaign warnings",
      "Product and campaign Opportunity Scores",
      "AI chat and current market scans",
      "Product selection and complete campaign packages",
      "Weekly deep strategy with budget safeguards",
      "20 AI flyer concepts and ad visuals per month",
    ]),
  }),
});

function getRawPlanValue(planLike) {
  if (planLike && typeof planLike === "object") {
    return (
      planLike.planKey ||
      planLike.plan ||
      planLike.name ||
      planLike.currentPlan ||
      planLike.label ||
      ""
    );
  }

  return planLike;
}

export function normalizePlanKey(planLike) {
  const value = String(getRawPlanValue(planLike) || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");

  if (
    value === PLAN_KEYS.EXPERT ||
    value === "expert+" ||
    value === "expert_plus" ||
    value === "expert_operator"
  ) {
    return PLAN_KEYS.EXPERT;
  }

  if (value === PLAN_KEYS.PRO || value === "pro_analytics") {
    return PLAN_KEYS.PRO;
  }

  if (value === PLAN_KEYS.BASIC || value === "basic_analytics") {
    return PLAN_KEYS.BASIC;
  }

  return PLAN_KEYS.FREE;
}

export function getPlanDefinition(planLike) {
  return PLAN_DEFINITIONS[normalizePlanKey(planLike)];
}

export function getPlanLabel(planLike) {
  return getPlanDefinition(planLike).label;
}

export function isFreePlan(planLike) {
  return normalizePlanKey(planLike) === PLAN_KEYS.FREE;
}

export function isBasicPlan(planLike) {
  return normalizePlanKey(planLike) === PLAN_KEYS.BASIC;
}

export function isProPlan(planLike) {
  const planKey = normalizePlanKey(planLike);
  return planKey === PLAN_KEYS.PRO || planKey === PLAN_KEYS.EXPERT;
}

export function isExpertPlan(planLike) {
  return normalizePlanKey(planLike) === PLAN_KEYS.EXPERT;
}

export function hasBasicFeatures(planLike) {
  return !isFreePlan(planLike);
}

export function getCampaignLimit(planLike) {
  return getPlanDefinition(planLike).campaignLimit;
}

export function getPlanCapabilities(planLike, campaignCount = 0) {
  const planKey = normalizePlanKey(planLike);
  const definition = getPlanDefinition(planKey);
  const normalizedCampaignCount = Math.max(Number(campaignCount) || 0, 0);
  const campaignLimit = definition.campaignLimit;
  const hasBasic = hasBasicFeatures(planKey);
  const hasPro = isProPlan(planKey);
  const hasExpert = isExpertPlan(planKey);
  const remainingCampaigns =
    campaignLimit === null
      ? null
      : Math.max(campaignLimit - normalizedCampaignCount, 0);

  return {
    plan: definition.label,
    planKey,
    campaignLimit,
    campaignCount: normalizedCampaignCount,
    remainingCampaigns,
    canCreateCampaign:
      campaignLimit === null || normalizedCampaignCount < campaignLimit,
    hasUnlimitedCampaigns: campaignLimit === null,

    canUseCostAnalytics: hasBasic,
    canUsePerformanceHistory: hasBasic,
    canUseCampaignComparison: hasBasic,
    canViewOrderDetails: hasBasic,
    canViewEventStream: hasBasic,
    canExportCampaigns: hasBasic,
    canSetInitialCampaignCost: hasBasic,

    canUseAddToCartTracking: hasPro,
    canUseProDiagnosis: hasPro,
    canEditCampaignCost: hasPro,

    canUseExpertOperator: hasExpert,
    canUseOpportunityScores: hasExpert,
    canUseDailyRecommendations: hasExpert,
    canUseExpertChat: hasExpert,
    canUseMarketAnalysis: hasExpert,
    canUseCampaignPackages: hasExpert,
    canUseWeeklyStrategy: hasExpert,
    canGenerateExpertAssets: hasExpert,
  };
}

export function getCampaignCostUpdateMode(planLike, currentCostCents) {
  const capabilities = getPlanCapabilities(planLike);

  if (capabilities.canEditCampaignCost) {
    return "update";
  }

  if (
    capabilities.canSetInitialCampaignCost &&
    Math.max(Number(currentCostCents) || 0, 0) === 0
  ) {
    return "initial";
  }

  return "locked";
}

export function buildCampaignLimitMessage(planLike) {
  const planKey = normalizePlanKey(planLike);
  const campaignLimit = getCampaignLimit(planKey);

  if (planKey === PLAN_KEYS.BASIC) {
    return `Your Basic plan includes up to ${campaignLimit} campaigns. Upgrade to Pro to create unlimited campaigns.`;
  }

  if (planKey === PLAN_KEYS.PRO || planKey === PLAN_KEYS.EXPERT) {
    return `Your ${getPlanLabel(planKey)} plan includes unlimited campaigns.`;
  }

  return `Your Free plan includes ${campaignLimit} campaigns. Upgrade to Basic for up to ${BASIC_CAMPAIGN_LIMIT} campaigns and profitability analytics, Pro for the full funnel, or Expert for daily decisions.`;
}
