import assert from "node:assert/strict";
import test from "node:test";

import {
  BASIC_CAMPAIGN_LIMIT,
  FREE_CAMPAIGN_LIMIT,
  buildCampaignLimitMessage,
  getCampaignCostUpdateMode,
  getPlanCapabilities,
  normalizePlanKey,
} from "../app/plans.js";

test("Free keeps core tracking and enforces the three-campaign limit", () => {
  const capabilities = getPlanCapabilities("free", FREE_CAMPAIGN_LIMIT);

  assert.equal(capabilities.plan, "Free");
  assert.equal(capabilities.canCreateCampaign, false);
  assert.equal(capabilities.canUseCostAnalytics, false);
  assert.equal(capabilities.canExportCampaigns, false);
  assert.equal(capabilities.canUseAddToCartTracking, false);
});

test("Basic adds profitability tools and twenty campaigns", () => {
  const capabilities = getPlanCapabilities("basic", 7);

  assert.equal(capabilities.campaignLimit, BASIC_CAMPAIGN_LIMIT);
  assert.equal(capabilities.remainingCampaigns, 13);
  assert.equal(capabilities.canUseCostAnalytics, true);
  assert.equal(capabilities.canUsePerformanceHistory, true);
  assert.equal(capabilities.canViewOrderDetails, true);
  assert.equal(capabilities.canExportCampaigns, true);
  assert.equal(capabilities.canSetInitialCampaignCost, true);
  assert.equal(capabilities.canUseAddToCartTracking, false);
});

test("Pro inherits Basic features and unlocks the full funnel", () => {
  const capabilities = getPlanCapabilities("pro", 200);

  assert.equal(capabilities.campaignLimit, null);
  assert.equal(capabilities.canCreateCampaign, true);
  assert.equal(capabilities.canExportCampaigns, true);
  assert.equal(capabilities.canUseAddToCartTracking, true);
  assert.equal(capabilities.canUseProDiagnosis, true);
  assert.equal(capabilities.canEditCampaignCost, true);
});

test("Expert is a paid tier above Pro with its own server capabilities", () => {
  const capabilities = getPlanCapabilities("expert_plus", 500);

  assert.equal(normalizePlanKey("expert_plus"), "expert");
  assert.equal(capabilities.plan, "Expert");
  assert.equal(capabilities.campaignLimit, null);
  assert.equal(capabilities.canUseAddToCartTracking, true);
  assert.equal(capabilities.canEditCampaignCost, true);
  assert.equal(capabilities.canUseExpertOperator, true);
  assert.equal(capabilities.canUseOpportunityScores, true);
  assert.equal(capabilities.canUseDailyRecommendations, true);
  assert.equal(capabilities.canUseExpertChat, true);
  assert.equal(capabilities.canUseMarketAnalysis, true);
  assert.equal(capabilities.canUseCampaignPackages, true);
  assert.equal(capabilities.canUseWeeklyStrategy, true);
  assert.equal(capabilities.canGenerateExpertAssets, true);
});

test("upgrade and downgrade capability changes are deterministic", () => {
  const upgraded = getPlanCapabilities("basic", 3);
  const downgraded = getPlanCapabilities("free", 3);

  assert.equal(upgraded.canCreateCampaign, true);
  assert.equal(upgraded.canUseCostAnalytics, true);
  assert.equal(downgraded.canCreateCampaign, false);
  assert.equal(downgraded.canUseCostAnalytics, false);
  assert.match(buildCampaignLimitMessage(downgraded), /Free plan/);
});

test("Basic can set a missing cost once while Pro can keep updating it", () => {
  assert.equal(getCampaignCostUpdateMode("free", 0), "locked");
  assert.equal(getCampaignCostUpdateMode("basic", 0), "initial");
  assert.equal(getCampaignCostUpdateMode("basic", 1), "locked");
  assert.equal(getCampaignCostUpdateMode("pro", 1), "update");
});
