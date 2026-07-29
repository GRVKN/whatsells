import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router";

import CampaignDemoModal from "../components/CampaignDemoModal.jsx";
import CampaignQr from "../components/CampaignQr.jsx";
import DashboardSkeleton from "../components/DashboardSkeleton.jsx";
import GettingStartedCard from "../components/GettingStartedCard.jsx";
import InfoLabel from "../components/InfoLabel.jsx";
import OnboardingModal from "../components/OnboardingModal.jsx";
import PlanComparison from "../components/PlanComparison.jsx";
import ProductCampaignGroups from "../components/ProductCampaignGroups.jsx";
import ProductPickerField from "../components/ProductPickerField.jsx";
import {
  hasCampaignDraftErrors,
  validateCampaignDraft,
} from "../campaign-form";
import { CAMPAIGN_SOURCE_OPTIONS } from "../campaign-sources";
import {
  buildSetupChecklist,
  calculateSetupProgress,
  ONBOARDING_STORAGE_KEY,
  PREPARED_ASSET_STORAGE_KEY,
} from "../getting-started";
import { DEFAULT_CURRENCY } from "../money";
import { useI18n } from "../i18n-context";
import { buildProductGroups } from "../product-groups";
import {
  BASIC_CAMPAIGN_LIMIT,
  FREE_CAMPAIGN_LIMIT,
  getCampaignLimit as getCentralCampaignLimit,
  getPlanCapabilities as buildPlanCapabilities,
  getPlanLabel as getCentralPlanLabel,
  isBasicPlan as isCentralBasicPlan,
  isExpertPlan as isCentralExpertPlan,
  isFreePlan as isCentralFreePlan,
  isProPlan as isCentralProPlan,
} from "../plans";
import styles from "../styles/dashboard.module.css";
import {
  Page,
  Card,
  Layout,
  Text,
  TextField,
  Button,
  Select,
  Banner,
  InlineStack,
  BlockStack,
  Toast,
  Badge,
} from "@shopify/polaris";

// ----------------------
// Helpers
// ----------------------
async function safeCopy(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

const TRACK_BASE_URL =
  import.meta.env.VITE_TRACK_BASE_URL || "https://app.whatsells.dev";

function buildGoUrl(token) {
  return new URL(`/go/${token}`, TRACK_BASE_URL).toString();
}

function numberOrZero(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function numberOrNull(value) {
  if (value === null || value === undefined) return null;

  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getProfitCents(campaign) {
  if (campaign?.profitCents !== null && campaign?.profitCents !== undefined) {
    return numberOrZero(campaign.profitCents);
  }

  return (
    numberOrZero(campaign?.revenueCents) - numberOrZero(campaign?.costCents)
  );
}

function getCampaignPerformance(campaign) {
  const costCents = numberOrZero(campaign?.costCents);
  const revenueCents = numberOrZero(campaign?.revenueCents);
  const profitCents = getProfitCents(campaign);

  const clicks7d = numberOrZero(campaign?.clicks7d);
  const clicks30d = numberOrZero(campaign?.clicks30d);
  const clicksTotal = numberOrZero(campaign?.clicksCount);
  const orders = numberOrZero(campaign?.ordersCount);

  const roi = numberOrNull(campaign?.roi);
  const roas = numberOrNull(campaign?.roas);
  const conversionRate = numberOrNull(campaign?.conversionRate);

  return {
    costCents,
    revenueCents,
    profitCents,
    clicks7d,
    clicks30d,
    clicksTotal,
    orders,
    roi: roi ?? 0,
    roas: roas ?? 0,
    conversionRate: conversionRate ?? 0,
    createdAtMs: campaign?.createdAt
      ? new Date(campaign.createdAt).getTime()
      : 0,
  };
}

function hasCampaignSignal(campaign) {
  const p = getCampaignPerformance(campaign);

  return (
    p.costCents > 0 ||
    p.revenueCents > 0 ||
    p.orders > 0 ||
    p.clicksTotal > 0 ||
    p.clicks30d > 0 ||
    p.clicks7d > 0
  );
}

function compareTopCampaigns(a, b) {
  const pa = getCampaignPerformance(a);
  const pb = getCampaignPerformance(b);

  const checks = [
    pb.profitCents - pa.profitCents,
    pb.roi - pa.roi,
    pb.revenueCents - pa.revenueCents,
    pb.orders - pa.orders,
    pb.conversionRate - pa.conversionRate,
    pb.roas - pa.roas,
    pb.clicks30d - pa.clicks30d,
    pb.clicksTotal - pa.clicksTotal,
    pa.costCents - pb.costCents,
    pb.createdAtMs - pa.createdAtMs,
  ];

  return checks.find((value) => value !== 0) || 0;
}

function compareCampaignsNeedingAttention(a, b) {
  const pa = getCampaignPerformance(a);
  const pb = getCampaignPerformance(b);

  const checks = [
    pa.profitCents - pb.profitCents,
    pa.roi - pb.roi,
    pa.revenueCents - pb.revenueCents,
    pa.orders - pb.orders,
    pa.conversionRate - pb.conversionRate,
    pa.roas - pb.roas,
    pa.clicks30d - pb.clicks30d,
    pa.clicksTotal - pb.clicksTotal,
    pb.costCents - pa.costCents,
    pb.createdAtMs - pa.createdAtMs,
  ];

  return checks.find((value) => value !== 0) || 0;
}

function getDefaultCapabilities() {
  return buildPlanCapabilities("free", 0);
}

function getPlanName(capabilities) {
  return getCentralPlanLabel(capabilities);
}

function isProPlan(capabilities) {
  return isCentralProPlan(capabilities);
}

function isBasicPlan(capabilities) {
  return isCentralBasicPlan(capabilities);
}

function isExpertPlan(capabilities) {
  return isCentralExpertPlan(capabilities);
}

function isFreePlan(capabilities) {
  return isCentralFreePlan(capabilities);
}

function getCampaignLimit(capabilities) {
  return getCentralCampaignLimit(capabilities);
}

function getRemainingCampaigns(capabilities, campaignCount) {
  const limit = getCampaignLimit(capabilities);

  if (limit === null) return null;

  return Math.max(limit - campaignCount, 0);
}

function canCreateCampaign(capabilities, campaignCount) {
  const limit = getCampaignLimit(capabilities);

  if (limit === null) return true;

  return campaignCount < limit;
}

function getPlanBadgeTone(capabilities) {
  if (isProPlan(capabilities)) return "success";
  if (isBasicPlan(capabilities)) return "info";

  return "attention";
}

function getPlanHeadline(capabilities, campaignCount, t) {
  const planName = getPlanName(capabilities);
  const limit = getCampaignLimit(capabilities);

  if (limit === null) {
    return t(
      isExpertPlan(capabilities)
        ? "Expert Operator active · Unlimited campaigns"
        : "Pro Analytics active · Unlimited campaigns",
    );
  }

  return t("{plan} plan · {used} of {limit} campaigns used", {
    plan: t(planName),
    used: campaignCount,
    limit,
  });
}

function getPlanHelpText(capabilities, campaignCount, t) {
  const planName = getPlanName(capabilities);
  const limit = getCampaignLimit(capabilities);
  const remaining = getRemainingCampaigns(capabilities, campaignCount);

  if (limit === null) {
    return t(
      isExpertPlan(capabilities)
        ? "You can use the complete funnel plus daily Opportunity Scores, warnings and next-action recommendations."
        : "You can create unlimited campaigns and use the complete click → add-to-cart → order funnel. Expert adds daily decisions and Opportunity Scores.",
    );
  }

  if (remaining <= 0 && planName === "Free") {
    return t(
      "You have used your {limit} free campaigns. Upgrade to Basic for up to {basicLimit} campaigns or Pro for unlimited campaigns.",
      { limit: FREE_CAMPAIGN_LIMIT, basicLimit: BASIC_CAMPAIGN_LIMIT },
    );
  }

  if (remaining <= 0 && planName === "Basic") {
    return t(
      "You have used your {limit} Basic campaigns. Upgrade to Pro Analytics for unlimited campaigns and Add-to-Cart tracking.",
      { limit: BASIC_CAMPAIGN_LIMIT },
    );
  }

  if (planName === "Free") {
    return t(
      remaining === 1
        ? "{remaining} free campaign remaining. Basic adds profitability analytics, time ranges and CSV export."
        : "{remaining} free campaigns remaining. Basic adds profitability analytics, time ranges and CSV export.",
      { remaining },
    );
  }

  return t(
    remaining === 1
      ? "{remaining} Basic campaign remaining. Your profitability analytics and CSV export are active."
      : "{remaining} Basic campaigns remaining. Your profitability analytics and CSV export are active.",
    { remaining },
  );
}

function getCreateButtonLabel(capabilities, campaignCount) {
  if (canCreateCampaign(capabilities, campaignCount)) {
    return "Create campaign";
  }

  if (isFreePlan(capabilities)) {
    return "Free limit reached";
  }

  if (isBasicPlan(capabilities)) {
    return "Basic limit reached";
  }

  return "Create campaign";
}

function getUpgradeButtonLabel(capabilities) {
  if (isBasicPlan(capabilities)) {
    return "Upgrade to Pro Analytics";
  }

  if (isProPlan(capabilities) && !isExpertPlan(capabilities)) {
    return "Upgrade to Expert";
  }

  return "Upgrade to Basic";
}

function getNextPlanUrl(
  capabilities,
  { upgradeUrl, basicUrl, proUrl, expertUrl },
) {
  if (isExpertPlan(capabilities)) {
    return upgradeUrl;
  }

  if (isProPlan(capabilities)) {
    return expertUrl || upgradeUrl;
  }

  if (isBasicPlan(capabilities)) {
    return proUrl || upgradeUrl;
  }

  return basicUrl || upgradeUrl || proUrl || expertUrl;
}

// ----------------------
// Small UI blocks
// ----------------------
function MetricCard({ label, value, helpText, infoKey }) {
  return (
    <div className={styles.metricCell}>
      <Card>
        <BlockStack gap="100">
          <div style={{ color: "#616161", fontSize: 13 }}>
            <InfoLabel label={label} infoKey={infoKey} />
          </div>

          <Text variant="headingLg" as="p">
            {value}
          </Text>

          {helpText ? (
            <Text as="p" tone="subdued">
              {helpText}
            </Text>
          ) : null}
        </BlockStack>
      </Card>
    </div>
  );
}

function CampaignHighlightCard({ title, campaign, emptyText, currency }) {
  const { t, formatMoney, formatPercent } = useI18n();
  if (!campaign) {
    return (
      <div className={styles.highlightCell}>
        <Card>
          <BlockStack gap="150">
            <Text variant="headingSm" as="h3">
              {title}
            </Text>

            <Text as="p" tone="subdued">
              {emptyText}
            </Text>
          </BlockStack>
        </Card>
      </div>
    );
  }

  const profitCents = getProfitCents(campaign);

  return (
    <div className={styles.highlightCell}>
      <Card>
        <BlockStack gap="150">
          <Text variant="headingSm" as="h3">
            {title}
          </Text>

          <Text variant="headingMd" as="p">
            {campaign.name}
          </Text>

          <Text as="p" tone="subdued">
            {t("Campaign result: {result} · ROI: {roi}", {
              result: formatMoney(profitCents, currency),
              roi: formatPercent(campaign.roi),
            })}
          </Text>

          <Text as="p" tone="subdued">
            {t("Net revenue: {revenue} · Orders: {orders} · Clicks: {clicks}", {
              revenue: formatMoney(campaign.revenueCents || 0, currency),
              orders: campaign.ordersCount ?? 0,
              clicks: campaign.clicksCount ?? 0,
            })}
          </Text>
        </BlockStack>
      </Card>
    </div>
  );
}

function WorkflowOverview() {
  const { t } = useI18n();
  return (
    <div className={styles.workflowGrid}>
      <div className={styles.workflowStep}>
        <span className={styles.stepNumber}>1</span>
        <BlockStack gap="100">
          <Text variant="headingSm" as="h3">
            {t("Choose the product")}
          </Text>
          <Text as="p" tone="subdued">
            {t("Select the exact product directly from your Shopify catalog.")}
          </Text>
        </BlockStack>
      </div>

      <div className={styles.workflowStep}>
        <span className={styles.stepNumber}>2</span>
        <BlockStack gap="100">
          <Text variant="headingSm" as="h3">
            {t("Create the campaign")}
          </Text>
          <Text as="p" tone="subdued">
            {t("WhatSells generates a unique tracking link and QR code.")}
          </Text>
        </BlockStack>
      </div>

      <div className={styles.workflowStep}>
        <span className={styles.stepNumber}>3</span>
        <BlockStack gap="100">
          <Text variant="headingSm" as="h3">
            {t("Share and measure")}
          </Text>
          <Text as="p" tone="subdued">
            {t(
              "Use the generated asset and watch clicks, orders and net revenue.",
            )}
          </Text>
        </BlockStack>
      </div>
    </div>
  );
}

function EmptyCampaignState({ onCreate, onViewDemo }) {
  const { t } = useI18n();
  return (
    <div className={styles.emptyState}>
      <BlockStack gap="300" inlineAlign="center">
        <BlockStack gap="100" inlineAlign="center">
          <Text variant="headingMd" as="h3">
            {t("Create your first measurable campaign")}
          </Text>

          <Text as="p" tone="subdued">
            {t(
              "You will immediately receive a unique tracking link and QR code. Demo data is available if you want to see the result first.",
            )}
          </Text>
        </BlockStack>

        <InlineStack gap="200" align="center" wrap>
          <Button variant="primary" onClick={onCreate}>
            {t("Create first campaign")}
          </Button>

          <Button onClick={onViewDemo}>{t("View example")}</Button>
        </InlineStack>
      </BlockStack>
    </div>
  );
}

function PlanStatusCard({
  capabilities,
  campaignCount,
  upgradeUrl,
  basicUrl,
  proUrl,
  expertUrl,
}) {
  const { t } = useI18n();
  const planName = getPlanName(capabilities);
  const limit = getCampaignLimit(capabilities);
  const remaining = getRemainingCampaigns(capabilities, campaignCount);
  const createAllowed = canCreateCampaign(capabilities, campaignCount);
  const showUpgradeButton =
    !isExpertPlan(capabilities) &&
    (upgradeUrl || basicUrl || proUrl || expertUrl);
  const nextPlanUrl = getNextPlanUrl(capabilities, {
    upgradeUrl,
    basicUrl,
    proUrl,
    expertUrl,
  });

  let bannerTone = "info";

  if (!createAllowed) {
    bannerTone = "warning";
  } else if (isProPlan(capabilities)) {
    bannerTone = "success";
  }

  return (
    <Banner tone={bannerTone}>
      <BlockStack gap="200">
        <InlineStack gap="200" align="space-between" wrap>
          <InlineStack gap="200" wrap>
            <Badge tone={getPlanBadgeTone(capabilities)}>{planName}</Badge>

            <Text as="p" fontWeight="semibold">
              {getPlanHeadline(capabilities, campaignCount, t)}
            </Text>
          </InlineStack>

          {isExpertPlan(capabilities) ? (
            <Button url="/app/expert">{t("Open daily operator")}</Button>
          ) : showUpgradeButton ? (
            <Button
              variant="primary"
              onClick={() => {
                window.open(nextPlanUrl, "_top");
              }}
            >
              {t(getUpgradeButtonLabel(capabilities))}
            </Button>
          ) : null}
        </InlineStack>

        <Text as="p">{getPlanHelpText(capabilities, campaignCount, t)}</Text>

        <InlineStack gap="200" wrap>
          <Text as="p" tone="subdued">
            {t("Free: {limit} campaigns + core tracking", {
              limit: FREE_CAMPAIGN_LIMIT,
            })}
          </Text>

          <Text as="p" tone="subdued">
            {t("Basic: {limit} campaigns + profitability", {
              limit: BASIC_CAMPAIGN_LIMIT,
            })}
          </Text>

          <Text as="p" tone="subdued">
            {t("Pro: unlimited + full funnel")}
          </Text>

          <Text as="p" tone="subdued">
            {t("Expert: daily actions + Opportunity Scores")}
          </Text>

          {isProPlan(capabilities) ? (
            <Text as="p" tone="subdued">
              {t("Add-to-Cart tracking enabled")}
            </Text>
          ) : (
            <Text as="p" tone="subdued">
              {t("Add-to-Cart tracking requires Pro")}
            </Text>
          )}
        </InlineStack>

        {limit !== null ? (
          <Text as="p" tone="subdued">
            {t("Remaining campaigns: {remaining}", { remaining })}
          </Text>
        ) : null}
      </BlockStack>
    </Banner>
  );
}

function LockedBasicAnalytics({ basicUrl, upgradeUrl }) {
  const { t } = useI18n();
  return (
    <Banner tone="info">
      <BlockStack gap="200">
        <InlineStack gap="200" wrap>
          <Badge tone="attention">{t("Basic analytics locked")}</Badge>

          <Text as="p" fontWeight="semibold">
            {t("See whether a campaign actually earns more than it costs.")}
          </Text>
        </InlineStack>

        <Text as="p">
          {t(
            "Basic adds campaign cost, campaign result, ROI, ROAS, time-range charts, rankings, order details and CSV export for up to {limit} campaigns.",
            { limit: BASIC_CAMPAIGN_LIMIT },
          )}
        </Text>

        {basicUrl || upgradeUrl ? (
          <Button
            variant="primary"
            onClick={() => window.open(basicUrl || upgradeUrl, "_top")}
          >
            {t("Upgrade to Basic")}
          </Button>
        ) : null}
      </BlockStack>
    </Banner>
  );
}

// ----------------------
// Component
// ----------------------
export default function AppIndex() {
  const location = useLocation();
  const navigate = useNavigate();
  const embeddedQuery = location.search || "";
  const createSectionRef = useRef(null);
  const campaignsSectionRef = useRef(null);
  const { t, formatMoney, formatPercent } = useI18n();

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [err, setErr] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [capabilities, setCapabilities] = useState(getDefaultCapabilities());
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [formErrors, setFormErrors] = useState({});

  const [upgradeUrl, setUpgradeUrl] = useState("");
  const [basicUrl, setBasicUrl] = useState("");
  const [proUrl, setProUrl] = useState("");
  const [expertUrl, setExpertUrl] = useState("");

  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState("qr");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [toast, setToast] = useState({
    active: false,
    content: "",
  });

  const [qrOpen, setQrOpen] = useState(false);
  const [qrValue, setQrValue] = useState("");
  const [qrTitle, setQrTitle] = useState("");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [hasPreparedAsset, setHasPreparedAsset] = useState(false);

  const campaignCount = campaigns.length;
  const productCount = useMemo(
    () =>
      new Set(
        campaigns.map((campaign) => campaign?.product?.id).filter(Boolean),
      ).size,
    [campaigns],
  );
  const createAllowed = canCreateCampaign(capabilities, campaignCount);
  const hasBasicAnalytics = Boolean(capabilities.canUseCostAnalytics);
  const canExportCampaigns = Boolean(capabilities.canExportCampaigns);

  const showToast = useCallback((content) => {
    setToast({ active: true, content });
  }, []);

  const dismissToast = useCallback(() => {
    setToast((prev) => ({ ...prev, active: false }));
  }, []);

  const sourceOptions = useMemo(
    () =>
      CAMPAIGN_SOURCE_OPTIONS.map((option) => ({
        ...option,
        label: t(option.label),
      })),
    [t],
  );

  const sourceLabelByValue = useMemo(() => {
    const map = {};

    for (const option of sourceOptions) {
      map[option.value] = option.label;
    }

    return map;
  }, [sourceOptions]);

  const sourceFilterOptions = useMemo(
    () => [{ label: t("All channels"), value: "all" }, ...sourceOptions],
    [sourceOptions, t],
  );

  const statusFilterOptions = useMemo(
    () => [
      { label: t("All statuses"), value: "all" },
      { label: t("Active"), value: "active" },
      { label: t("Paused"), value: "paused" },
      { label: t("Archived"), value: "archived" },
    ],
    [t],
  );

  const rankedCampaigns = useMemo(() => {
    if (!capabilities.canUseCampaignComparison) return [];

    return campaigns.filter((campaign) => {
      return campaign?.id && hasCampaignSignal(campaign);
    });
  }, [campaigns, capabilities.canUseCampaignComparison]);

  const topCampaign = useMemo(() => {
    if (!rankedCampaigns.length) return null;

    return [...rankedCampaigns].sort(compareTopCampaigns)[0];
  }, [rankedCampaigns]);

  const attentionCampaign = useMemo(() => {
    if (!rankedCampaigns.length) return null;

    return [...rankedCampaigns].sort(compareCampaignsNeedingAttention)[0];
  }, [rankedCampaigns]);

  const overview = useMemo(() => {
    const totals = campaigns.reduce(
      (sum, campaign) => {
        const revenueCents = numberOrZero(campaign?.revenueCents);
        const costCents = numberOrZero(campaign?.costCents);
        const profitCents = getProfitCents(campaign);
        const orders = numberOrZero(campaign?.ordersCount);
        const cancelledOrders = numberOrZero(campaign?.cancelledOrdersCount);
        const refundedCents = numberOrZero(campaign?.refundedCents);
        const clicks = numberOrZero(campaign?.clicksCount);

        return {
          revenueCents: sum.revenueCents + revenueCents,
          costCents: sum.costCents + costCents,
          profitCents: sum.profitCents + profitCents,
          orders: sum.orders + orders,
          cancelledOrders: sum.cancelledOrders + cancelledOrders,
          refundedCents: sum.refundedCents + refundedCents,
          clicks: sum.clicks + clicks,
        };
      },
      {
        revenueCents: 0,
        costCents: 0,
        profitCents: 0,
        orders: 0,
        cancelledOrders: 0,
        refundedCents: 0,
        clicks: 0,
      },
    );

    return {
      ...totals,
      roi: totals.costCents > 0 ? totals.profitCents / totals.costCents : null,
      conversionRate: totals.clicks > 0 ? totals.orders / totals.clicks : null,
    };
  }, [campaigns]);

  const setupChecklist = useMemo(
    () =>
      buildSetupChecklist({
        campaignCount,
        hasPreparedAsset,
        clicks: overview.clicks,
        orders: overview.orders,
      }),
    [campaignCount, hasPreparedAsset, overview.clicks, overview.orders],
  );

  const setupProgress = useMemo(
    () => calculateSetupProgress(setupChecklist),
    [setupChecklist],
  );

  const resetForm = useCallback(() => {
    setName("");
    setSourceType("qr");
    setSelectedProduct(null);
    setCost("");
    setNotes("");
    setFormErrors({});
  }, []);

  const markOnboardingSeen = useCallback(() => {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "seen");
    } catch {
      // The guide can still be used when browser storage is unavailable.
    }
  }, []);

  const closeOnboarding = useCallback(() => {
    markOnboardingSeen();
    setOnboardingOpen(false);
  }, [markOnboardingSeen]);

  const markAssetPrepared = useCallback(() => {
    setHasPreparedAsset(true);

    try {
      window.localStorage.setItem(PREPARED_ASSET_STORAGE_KEY, "true");
    } catch {
      // This milestone is only a UI convenience; tracking remains unaffected.
    }
  }, []);

  const scrollToCreate = useCallback(() => {
    createSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    window.setTimeout(() => {
      createSectionRef.current?.querySelector("input")?.focus();
    }, 350);
  }, []);

  const scrollToCampaigns = useCallback(() => {
    campaignsSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const loadCampaigns = useCallback(async () => {
    setErr("");
    setLoading(true);

    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          data?.error || t("Load failed ({status})", { status: res.status }),
        );
      }

      const nextCampaigns = Array.isArray(data?.campaigns)
        ? data.campaigns
        : [];

      setCampaigns(nextCampaigns);
      setCurrency(data?.currency || DEFAULT_CURRENCY);

      const nextCapabilities = data?.capabilities
        ? data.capabilities
        : buildPlanCapabilities("free", nextCampaigns.length);

      setCapabilities(nextCapabilities);

      if (data?.upgradeUrl) setUpgradeUrl(data.upgradeUrl);
      if (data?.basicUrl) setBasicUrl(data.basicUrl);
      if (data?.proUrl) setProUrl(data.proUrl);
      if (data?.expertUrl) setExpertUrl(data.expertUrl);
    } catch (e) {
      setErr(
        e?.message ||
          t("Could not load campaigns. Check your connection and try again."),
      );
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [t]);

  const createCampaign = useCallback(async () => {
    setErr("");
    setUpgradeUrl("");

    const trimmedName = name.trim();
    const nextFormErrors = validateCampaignDraft({
      name,
      shopifyProductId: selectedProduct?.id,
      cost,
    });

    setFormErrors(nextFormErrors);

    if (hasCampaignDraftErrors(nextFormErrors)) {
      setErr(t("Check the highlighted campaign fields and try again."));
      return;
    }

    if (!canCreateCampaign(capabilities, campaignCount)) {
      setErr(getPlanHelpText(capabilities, campaignCount, t));
      return;
    }

    const payload = {
      name: trimmedName,
      sourceType,
      notes,
      shopifyProductId: selectedProduct.id,
      ...(capabilities.canUseCostAnalytics ? { cost } : {}),
    };

    setLoading(true);

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.upgradeRequired) {
          if (data?.upgradeUrl) setUpgradeUrl(data.upgradeUrl);
          if (data?.basicUrl) setBasicUrl(data.basicUrl);
          if (data?.proUrl) setProUrl(data.proUrl);
          if (data?.expertUrl) setExpertUrl(data.expertUrl);

          setErr(
            data.error ||
              t(
                "Your campaign limit has been reached. Upgrade to create more campaigns.",
              ),
          );

          if (data?.plan || data?.campaignLimit !== undefined) {
            setCapabilities((prev) => ({
              ...prev,
              plan: data?.plan || prev.plan,
              campaignLimit:
                data?.campaignLimit !== undefined
                  ? data.campaignLimit
                  : prev.campaignLimit,
              campaignCount:
                data?.campaignCount !== undefined
                  ? data.campaignCount
                  : campaignCount,
              remainingCampaigns:
                data?.remainingCampaigns !== undefined
                  ? data.remainingCampaigns
                  : 0,
              canCreateCampaign: false,
              canUseAddToCartTracking:
                data?.canUseAddToCartTracking ?? prev.canUseAddToCartTracking,
            }));
          }

          return;
        }

        throw new Error(
          data?.error || t("Create failed ({status})", { status: res.status }),
        );
      }

      if (data?.capabilities) {
        setCapabilities(data.capabilities);
      }

      resetForm();
      markOnboardingSeen();
      showToast(
        t(
          "Campaign created. Copy its tracking link or open the QR code to start collecting data.",
        ),
      );
      await loadCampaigns();
      window.setTimeout(scrollToCampaigns, 150);
    } catch (e) {
      setErr(e?.message || t("Could not create campaign."));
    } finally {
      setLoading(false);
    }
  }, [
    name,
    sourceType,
    selectedProduct,
    cost,
    notes,
    capabilities,
    campaignCount,
    resetForm,
    loadCampaigns,
    showToast,
    markOnboardingSeen,
    scrollToCampaigns,
    t,
  ]);

  const deleteCampaign = useCallback(
    async (campaignId, campaignName) => {
      const confirmed = window.confirm(
        t(
          'Delete campaign "{campaign}"?\n\nThis will also remove its tracked events.',
          { campaign: campaignName },
        ),
      );

      if (!confirmed) return;

      setErr("");
      setLoading(true);

      try {
        const res = await fetch("/api/campaigns", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: campaignId }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(
            data?.error ||
              t("Delete failed ({status})", { status: res.status }),
          );
        }

        showToast(
          t('Campaign "{campaign}" deleted', { campaign: campaignName }),
        );
        await loadCampaigns();
      } catch (e) {
        setErr(e?.message || t("Could not delete campaign."));
      } finally {
        setLoading(false);
      }
    },
    [loadCampaigns, showToast, t],
  );

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (!capabilities.canUseCostAnalytics && cost) {
      setCost("");
      setFormErrors((current) => ({
        ...current,
        cost: "",
      }));
    }
  }, [capabilities.canUseCostAnalytics, cost]);

  useEffect(() => {
    try {
      setHasPreparedAsset(
        window.localStorage.getItem(PREPARED_ASSET_STORAGE_KEY) === "true",
      );
    } catch {
      setHasPreparedAsset(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoading || err || onboardingChecked) return;

    setOnboardingChecked(true);

    try {
      const hasSeenOnboarding =
        window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "seen";

      if (!hasSeenOnboarding) {
        setOnboardingOpen(true);
      }
    } catch {
      setOnboardingOpen(campaignCount === 0);
    }
  }, [campaignCount, err, initialLoading, onboardingChecked]);

  const copyFirstTrackingLink = useCallback(async () => {
    const firstCampaign = campaigns[0];
    const goUrl = firstCampaign?.publicToken
      ? buildGoUrl(firstCampaign.publicToken)
      : "";

    if (!goUrl) {
      setErr(t("The first campaign does not have a tracking link yet."));
      return;
    }

    const ok = await safeCopy(goUrl);

    if (ok) {
      markAssetPrepared();
      showToast(
        t("Tracking link copied. Use this exact link in the campaign."),
      );
    } else {
      setErr(
        t("The tracking link could not be copied. Open the campaign below."),
      );
      scrollToCampaigns();
    }
  }, [campaigns, markAssetPrepared, scrollToCampaigns, showToast, t]);

  const handleSetupAction = useCallback(
    async (action) => {
      if (action === "create") {
        scrollToCreate();
        return;
      }

      if (action === "share") {
        await copyFirstTrackingLink();
        return;
      }

      if (action === "click") {
        await loadCampaigns();
        showToast(t("Tracking data refreshed"));
        return;
      }

      if (action === "order" && campaigns[0]?.id) {
        navigate(`/app/campaigns/${campaigns[0].id}${embeddedQuery}`);
        return;
      }

      scrollToCampaigns();
    },
    [
      campaigns,
      copyFirstTrackingLink,
      embeddedQuery,
      loadCampaigns,
      navigate,
      scrollToCampaigns,
      scrollToCreate,
      showToast,
      t,
    ],
  );

  const productGroups = useMemo(
    () =>
      buildProductGroups(campaigns, {
        search: productSearch,
        sourceType: sourceFilter,
        status: statusFilter,
      }),
    [campaigns, productSearch, sourceFilter, statusFilter],
  );

  const copyCampaignTrackingLink = useCallback(
    async (campaign) => {
      const goUrl = campaign?.publicToken
        ? buildGoUrl(campaign.publicToken)
        : "";

      if (!goUrl) {
        setErr(t("This campaign does not have a tracking link."));
        return;
      }

      const ok = await safeCopy(goUrl);

      if (ok) markAssetPrepared();
      showToast(ok ? t("Tracking link copied") : t("Copy failed"));
    },
    [markAssetPrepared, showToast, t],
  );

  const openCampaignQr = useCallback(
    (campaign) => {
      const goUrl = campaign?.publicToken
        ? buildGoUrl(campaign.publicToken)
        : "";

      if (!goUrl) {
        setErr(t("This campaign does not have a tracking link."));
        return;
      }

      markAssetPrepared();
      setQrValue(goUrl);
      setQrTitle(
        campaign?.product?.title
          ? `${campaign.product.title} · ${campaign.name}`
          : campaign?.name || "Campaign",
      );
      setQrOpen(true);
    },
    [markAssetPrepared, t],
  );

  const assignCampaignProduct = useCallback(
    async (campaign, product) => {
      setErr("");
      setLoading(true);

      try {
        const res = await fetch("/api/campaigns", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "assign_product",
            id: campaign.id,
            shopifyProductId: product.id,
          }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(
            data?.error ||
              t("Product assignment failed ({status})", {
                status: res.status,
              }),
          );
        }

        showToast(data?.message || t("Campaign assigned to Shopify product."));
        await loadCampaigns();
        return true;
      } catch (error) {
        setErr(
          error?.message ||
            t("Could not assign this campaign to the selected product."),
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [loadCampaigns, showToast, t],
  );

  if (initialLoading) {
    return (
      <Page title="WhatSells" subtitle={t("Campaign tracking for Shopify")}>
        <DashboardSkeleton />
      </Page>
    );
  }

  return (
    <>
      <Page title="WhatSells" subtitle={t("Campaign tracking for Shopify")}>
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {setupProgress < 100 ? (
                <GettingStartedCard
                  checklist={setupChecklist}
                  progress={setupProgress}
                  onNextAction={handleSetupAction}
                  onOpenGuide={() => setOnboardingOpen(true)}
                  onViewDemo={() => setDemoOpen(true)}
                />
              ) : null}

              <Card>
                <BlockStack gap="400">
                  <InlineStack gap="400" align="space-between" wrap>
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h2">
                        {t("Dashboard")}
                      </Text>

                      <Text as="p" tone="subdued">
                        {t(
                          "See which campaign links and QR codes create clicks, orders and revenue.",
                        )}
                      </Text>
                    </BlockStack>

                    <InlineStack gap="200" wrap>
                      <Button onClick={() => setOnboardingOpen(true)}>
                        {t("Setup guide")}
                      </Button>

                      <Button onClick={loadCampaigns} loading={loading}>
                        {t("Refresh data")}
                      </Button>
                    </InlineStack>
                  </InlineStack>

                  <PlanStatusCard
                    capabilities={capabilities}
                    campaignCount={campaignCount}
                    upgradeUrl={upgradeUrl}
                    basicUrl={basicUrl}
                    proUrl={proUrl}
                    expertUrl={expertUrl}
                  />

                  {err ? (
                    <Banner
                      tone={
                        upgradeUrl || proUrl || basicUrl || expertUrl
                          ? "warning"
                          : "critical"
                      }
                      onDismiss={() => {
                        setErr("");
                        setUpgradeUrl("");
                      }}
                    >
                      <BlockStack gap="200">
                        <Text as="p">{err}</Text>

                        {upgradeUrl || proUrl || basicUrl || expertUrl ? (
                          <InlineStack gap="200">
                            <Button
                              variant="primary"
                              onClick={() => {
                                window.open(
                                  getNextPlanUrl(capabilities, {
                                    upgradeUrl,
                                    basicUrl,
                                    proUrl,
                                    expertUrl,
                                  }),
                                  "_top",
                                );
                              }}
                            >
                              {t(getUpgradeButtonLabel(capabilities))}
                            </Button>
                          </InlineStack>
                        ) : (
                          <Button onClick={loadCampaigns} loading={loading}>
                            {t("Try again")}
                          </Button>
                        )}
                      </BlockStack>
                    </Banner>
                  ) : null}

                  <div className={styles.metricGrid}>
                    <MetricCard
                      label={t("Products")}
                      value={String(productCount)}
                      helpText={t(
                        "Shopify products with at least one campaign",
                      )}
                    />

                    <MetricCard
                      label={t("Clicks")}
                      value={String(overview.clicks)}
                      helpText={t(
                        "Tracked visits through campaign links and QR codes",
                      )}
                    />

                    <MetricCard
                      label={t("Orders")}
                      infoKey="orders"
                      value={String(overview.orders)}
                      helpText={t("Attributed active orders")}
                    />

                    <MetricCard
                      label={t("Net revenue")}
                      infoKey="revenue"
                      value={formatMoney(overview.revenueCents, currency)}
                      helpText={t(
                        "Attributed revenue after refunds and cancellations",
                      )}
                    />

                    <MetricCard
                      label={t("Conversion")}
                      infoKey="conversion"
                      value={formatPercent(overview.conversionRate)}
                      helpText={t("Orders divided by tracked clicks")}
                    />

                    {hasBasicAnalytics ? (
                      <>
                        <MetricCard
                          label={t("Campaign result")}
                          infoKey="campaignResult"
                          value={formatMoney(overview.profitCents, currency)}
                          helpText={t(
                            "Revenue minus campaign cost; product and operating costs are excluded",
                          )}
                        />

                        <MetricCard
                          label={t("ROI")}
                          infoKey="roi"
                          value={formatPercent(overview.roi)}
                          helpText={t(
                            "Campaign result divided by campaign cost",
                          )}
                        />

                        <MetricCard
                          label={t("Refunds")}
                          infoKey="refunds"
                          value={formatMoney(overview.refundedCents, currency)}
                          helpText={t("Refunded value from attributed orders")}
                        />

                        <MetricCard
                          label={t("Cancelled orders")}
                          infoKey="cancelledOrders"
                          value={String(overview.cancelledOrders)}
                          helpText={t(
                            "Removed from active order and conversion counts",
                          )}
                        />
                      </>
                    ) : null}
                  </div>

                  {hasBasicAnalytics ? (
                    <div className={styles.highlightGrid}>
                      <CampaignHighlightCard
                        title={t("Top campaign")}
                        campaign={topCampaign}
                        currency={currency}
                        emptyText={t("No campaign performance data yet.")}
                      />

                      <CampaignHighlightCard
                        title={t("Needs attention")}
                        campaign={attentionCampaign}
                        currency={currency}
                        emptyText={t("No campaign needs attention yet.")}
                      />
                    </div>
                  ) : (
                    <LockedBasicAnalytics
                      basicUrl={basicUrl}
                      upgradeUrl={upgradeUrl}
                    />
                  )}
                </BlockStack>
              </Card>

              <PlanComparison
                capabilities={capabilities}
                upgradeUrl={upgradeUrl}
                basicUrl={basicUrl}
                proUrl={proUrl}
                expertUrl={expertUrl}
              />

              <div ref={createSectionRef} className={styles.anchorSection}>
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h2">
                        {t("Create campaign")}
                      </Text>

                      <Text as="p" tone="subdued">
                        {t(
                          "Create a tracking link or QR campaign and send visitors to your Shopify product page.",
                        )}
                      </Text>
                    </BlockStack>

                    <WorkflowOverview />

                    {!createAllowed ? (
                      <Banner tone="warning">
                        <BlockStack gap="200">
                          <Text as="p">
                            {getPlanHelpText(capabilities, campaignCount, t)}
                          </Text>

                          {upgradeUrl || proUrl || basicUrl || expertUrl ? (
                            <Button
                              variant="primary"
                              onClick={() => {
                                window.open(
                                  getNextPlanUrl(capabilities, {
                                    upgradeUrl,
                                    basicUrl,
                                    proUrl,
                                    expertUrl,
                                  }),
                                  "_top",
                                );
                              }}
                            >
                              {t(getUpgradeButtonLabel(capabilities))}
                            </Button>
                          ) : null}
                        </BlockStack>
                      </Banner>
                    ) : null}

                    <div className={styles.formGrid}>
                      <div
                        className={`${styles.fieldCell} ${styles.nameField}`}
                      >
                        <TextField
                          label={
                            <InfoLabel
                              label={t("Campaign name")}
                              infoKey="campaignName"
                            />
                          }
                          value={name}
                          onChange={(value) => {
                            setName(value);
                            setFormErrors((current) => ({
                              ...current,
                              name: "",
                            }));
                          }}
                          autoComplete="off"
                          placeholder={t(
                            "e.g. TikTok creator, flyer drop, packaging insert",
                          )}
                          error={
                            formErrors.name ? t(formErrors.name) : undefined
                          }
                          disabled={!createAllowed}
                        />
                      </div>

                      <div
                        className={`${styles.fieldCell} ${styles.typeField}`}
                      >
                        <Select
                          label={
                            <InfoLabel
                              label={t("Campaign type")}
                              infoKey="campaignType"
                            />
                          }
                          options={sourceOptions}
                          value={sourceType}
                          onChange={setSourceType}
                          disabled={!createAllowed}
                        />
                      </div>

                      <div
                        className={`${styles.fieldCell} ${styles.productField}`}
                      >
                        <BlockStack gap="150">
                          <InfoLabel
                            label={t("Shopify product")}
                            infoKey="productSelection"
                          />
                          <ProductPickerField
                            selectedProduct={selectedProduct}
                            onSelect={(product) => {
                              setSelectedProduct(product);
                              setFormErrors((current) => ({
                                ...current,
                                product: "",
                              }));
                            }}
                            error={
                              formErrors.product ? t(formErrors.product) : ""
                            }
                            disabled={!createAllowed}
                          />
                        </BlockStack>
                      </div>

                      <div
                        className={`${styles.fieldCell} ${styles.costField}`}
                      >
                        <TextField
                          label={
                            <InfoLabel
                              label={t("Campaign cost ({currency})", {
                                currency,
                              })}
                              infoKey="campaignCost"
                            />
                          }
                          value={cost}
                          onChange={(value) => {
                            setCost(value);
                            setFormErrors((current) => ({
                              ...current,
                              cost: "",
                            }));
                          }}
                          autoComplete="off"
                          placeholder={t("e.g. 250")}
                          helpText={
                            hasBasicAnalytics
                              ? t(
                                  "Optional. Used for campaign result, ROI and ROAS.",
                                )
                              : t(
                                  "Available from Basic. Free campaigns still track clicks, orders and net revenue.",
                                )
                          }
                          error={
                            formErrors.cost ? t(formErrors.cost) : undefined
                          }
                          disabled={!createAllowed || !hasBasicAnalytics}
                        />
                      </div>

                      <div
                        className={`${styles.fieldCell} ${styles.notesField}`}
                      >
                        <TextField
                          label={
                            <InfoLabel label={t("Notes")} infoKey="notes" />
                          }
                          value={notes}
                          onChange={setNotes}
                          autoComplete="off"
                          placeholder={t(
                            "e.g. 300 packaging inserts or creator deal",
                          )}
                          disabled={!createAllowed}
                        />
                      </div>

                      <div className={styles.createAction}>
                        <Button
                          variant="primary"
                          onClick={createCampaign}
                          loading={loading}
                          disabled={
                            !name.trim() || !selectedProduct || !createAllowed
                          }
                        >
                          {t(getCreateButtonLabel(capabilities, campaignCount))}
                        </Button>
                      </div>
                    </div>
                  </BlockStack>
                </Card>
              </div>

              <div ref={campaignsSectionRef} className={styles.anchorSection}>
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" gap="300" wrap>
                      <BlockStack gap="100">
                        <Text variant="headingMd" as="h2">
                          {t("Products & channels")}
                        </Text>

                        <Text as="p" tone="subdued">
                          {t(
                            "Every product brings its TikTok, Instagram, influencer, e-mail, flyer, packaging and event campaigns into one measurable view.",
                          )}
                        </Text>
                      </BlockStack>

                      <InlineStack gap="200" wrap>
                        {canExportCampaigns ? (
                          <Button
                            onClick={() => {
                              window.open(
                                `/api/campaigns/export${embeddedQuery}`,
                                "_top",
                              );
                            }}
                          >
                            {t("Export CSV")}
                          </Button>
                        ) : null}

                        <Badge tone={getPlanBadgeTone(capabilities)}>
                          {getPlanHeadline(capabilities, campaignCount, t)}
                        </Badge>
                      </InlineStack>
                    </InlineStack>

                    {campaigns.length ? (
                      <BlockStack gap="350">
                        <div className={styles.filterGrid}>
                          <div className={styles.searchField}>
                            <TextField
                              label={t("Search products and campaigns")}
                              value={productSearch}
                              onChange={setProductSearch}
                              autoComplete="off"
                              placeholder={t("Product, campaign or note")}
                              clearButton
                              onClearButtonClick={() => setProductSearch("")}
                            />
                          </div>

                          <div className={styles.filterField}>
                            <Select
                              label={t("Channel")}
                              options={sourceFilterOptions}
                              value={sourceFilter}
                              onChange={setSourceFilter}
                            />
                          </div>

                          <div className={styles.filterField}>
                            <Select
                              label={t("Status")}
                              options={statusFilterOptions}
                              value={statusFilter}
                              onChange={setStatusFilter}
                            />
                          </div>
                        </div>

                        <ProductCampaignGroups
                          groups={productGroups}
                          sourceLabelByValue={sourceLabelByValue}
                          currency={currency}
                          hasBasicAnalytics={hasBasicAnalytics}
                          hasProFunnel={Boolean(
                            capabilities.canUseAddToCartTracking,
                          )}
                          embeddedQuery={embeddedQuery}
                          onCopyLink={copyCampaignTrackingLink}
                          onOpenQr={openCampaignQr}
                          onDelete={deleteCampaign}
                          onAssignProduct={assignCampaignProduct}
                        />
                      </BlockStack>
                    ) : (
                      <EmptyCampaignState
                        onCreate={scrollToCreate}
                        onViewDemo={() => setDemoOpen(true)}
                      />
                    )}
                  </BlockStack>
                </Card>
              </div>

              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">
                    {t("Order tracking status")}
                  </Text>

                  <Text as="p" tone="subdued">
                    {t(
                      "Orders are attributed when a customer completes checkout after visiting your store through a WhatSells tracking link. Refunds reduce net revenue automatically, and cancelled orders are removed from active order and conversion counts. Open campaign details to view attributed orders and recent tracking events.",
                    )}
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <InlineStack gap="200" wrap>
                    <Badge
                      tone={isProPlan(capabilities) ? "success" : "attention"}
                    >
                      {t("Add-to-Cart tracking")}
                    </Badge>

                    <Text as="p" fontWeight="semibold">
                      {isProPlan(capabilities)
                        ? t("Available in your {plan} plan", {
                            plan: t(getPlanName(capabilities)),
                          })
                        : t("Available with Pro Analytics")}
                    </Text>
                  </InlineStack>

                  <Text as="p" tone="subdued">
                    {t(
                      "Pro and Expert record cart intent before an order happens and separate traffic from buying intent: click → add-to-cart → order. Free and Basic cart events are not stored.",
                    )}
                  </Text>

                  {!isProPlan(capabilities) && (proUrl || upgradeUrl) ? (
                    <Button
                      variant="primary"
                      onClick={() => window.open(proUrl || upgradeUrl, "_top")}
                    >
                      {t("Upgrade to Pro")}
                    </Button>
                  ) : null}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>

      {toast.active ? (
        <Toast content={toast.content} onDismiss={dismissToast} />
      ) : null}

      <CampaignQr
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        value={qrValue}
        title={qrTitle}
      />

      <OnboardingModal
        open={onboardingOpen}
        hasCampaigns={campaignCount > 0}
        onClose={closeOnboarding}
        onStart={campaignCount > 0 ? scrollToCampaigns : scrollToCreate}
        onViewDemo={() => {
          markOnboardingSeen();
          setOnboardingOpen(false);
          setDemoOpen(true);
        }}
      />

      <CampaignDemoModal
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        onStart={scrollToCreate}
      />
    </>
  );
}
