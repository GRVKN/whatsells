import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, Link } from "react-router";

import CampaignQr from "../components/CampaignQr.jsx";
import {
  Page,
  Card,
  Layout,
  Text,
  TextField,
  Button,
  Select,
  DataTable,
  Banner,
  InlineStack,
  BlockStack,
  Toast,
  Frame,
  Badge,
} from "@shopify/polaris";

// ----------------------
// Plan constants
// ----------------------
const FREE_CAMPAIGN_LIMIT = 3;
const BASIC_CAMPAIGN_LIMIT = 20;

// ----------------------
// Helpers
// ----------------------
function formatMoneyFromCents(cents) {
  const value = Number(cents || 0) / 100;

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  return `${(Number(value) * 100).toFixed(1)}%`;
}

function shorten(text, max = 45) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

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

  return numberOrZero(campaign?.revenueCents) - numberOrZero(campaign?.costCents);
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

function normalizePlanName(value) {
  return String(value || "free").trim().toLowerCase();
}

function getDefaultCapabilities() {
  return {
    plan: "Free",
    campaignLimit: FREE_CAMPAIGN_LIMIT,
    campaignCount: 0,
    remainingCampaigns: FREE_CAMPAIGN_LIMIT,
    canCreateCampaign: true,
    hasUnlimitedCampaigns: false,
    canUseAddToCartTracking: false,
  };
}

function getPlanName(capabilities) {
  const rawPlan = normalizePlanName(capabilities?.plan);

  if (rawPlan === "pro") return "Pro";
  if (rawPlan === "basic") return "Basic";

  return "Free";
}

function isProPlan(capabilities) {
  return getPlanName(capabilities) === "Pro";
}

function isBasicPlan(capabilities) {
  return getPlanName(capabilities) === "Basic";
}

function isFreePlan(capabilities) {
  return getPlanName(capabilities) === "Free";
}

function getCampaignLimit(capabilities) {
  if (capabilities?.campaignLimit === null) return null;

  const planName = getPlanName(capabilities);

  if (planName === "Pro") return null;
  if (planName === "Basic") return BASIC_CAMPAIGN_LIMIT;

  return FREE_CAMPAIGN_LIMIT;
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

function getPlanHeadline(capabilities, campaignCount) {
  const planName = getPlanName(capabilities);
  const limit = getCampaignLimit(capabilities);

  if (limit === null) {
    return "Pro Analytics active · Unlimited campaigns";
  }

  return `${planName} plan · ${campaignCount} of ${limit} campaigns used`;
}

function getPlanHelpText(capabilities, campaignCount) {
  const planName = getPlanName(capabilities);
  const limit = getCampaignLimit(capabilities);
  const remaining = getRemainingCampaigns(capabilities, campaignCount);

  if (limit === null) {
    return "You can create unlimited campaigns. Add-to-Cart tracking is reserved for Pro Analytics.";
  }

  if (remaining <= 0 && planName === "Free") {
    return `You have used your ${FREE_CAMPAIGN_LIMIT} free campaigns. Upgrade to Basic for up to ${BASIC_CAMPAIGN_LIMIT} campaigns or Pro for unlimited campaigns.`;
  }

  if (remaining <= 0 && planName === "Basic") {
    return `You have used your ${BASIC_CAMPAIGN_LIMIT} Basic campaigns. Upgrade to Pro Analytics for unlimited campaigns and Add-to-Cart tracking.`;
  }

  if (planName === "Free") {
    return `${remaining} free campaign${remaining === 1 ? "" : "s"} remaining. Upgrade when you need more.`;
  }

  return `${remaining} Basic campaign${remaining === 1 ? "" : "s"} remaining. Upgrade to Pro when you need unlimited campaigns.`;
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

  return "View plans";
}

// ----------------------
// Small UI blocks
// ----------------------
function MetricCard({ label, value, helpText }) {
  return (
    <div style={{ minWidth: 170, flex: 1 }}>
      <Card>
        <BlockStack gap="100">
          <Text as="p" tone="subdued">
            {label}
          </Text>

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

function CampaignHighlightCard({ title, campaign, emptyText }) {
  if (!campaign) {
    return (
      <div style={{ minWidth: 260, flex: 1 }}>
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
    <div style={{ minWidth: 260, flex: 1 }}>
      <Card>
        <BlockStack gap="150">
          <Text variant="headingSm" as="h3">
            {title}
          </Text>

          <Text variant="headingMd" as="p">
            {campaign.name}
          </Text>

          <Text as="p" tone="subdued">
            Profit: {formatMoneyFromCents(profitCents)} · ROI:{" "}
            {formatPercent(campaign.roi)}
          </Text>

          <Text as="p" tone="subdued">
            Revenue: {formatMoneyFromCents(campaign.revenueCents || 0)} ·
            Orders: {campaign.ordersCount ?? 0} · Clicks:{" "}
            {campaign.clicksCount ?? 0}
          </Text>
        </BlockStack>
      </Card>
    </div>
  );
}

function PlanStatusCard({
  capabilities,
  campaignCount,
  upgradeUrl,
  proUrl,
}) {
  const planName = getPlanName(capabilities);
  const limit = getCampaignLimit(capabilities);
  const remaining = getRemainingCampaigns(capabilities, campaignCount);
  const createAllowed = canCreateCampaign(capabilities, campaignCount);
  const showUpgradeButton = !isProPlan(capabilities) && (upgradeUrl || proUrl);

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
              {getPlanHeadline(capabilities, campaignCount)}
            </Text>
          </InlineStack>

          {showUpgradeButton ? (
            <Button
              variant="primary"
              onClick={() => {
                window.open(proUrl || upgradeUrl, "_top");
              }}
            >
              {getUpgradeButtonLabel(capabilities)}
            </Button>
          ) : null}
        </InlineStack>

        <Text as="p">{getPlanHelpText(capabilities, campaignCount)}</Text>

        <InlineStack gap="200" wrap>
          <Text as="p" tone="subdued">
            Free: {FREE_CAMPAIGN_LIMIT} campaigns
          </Text>

          <Text as="p" tone="subdued">
            Basic: {BASIC_CAMPAIGN_LIMIT} campaigns
          </Text>

          <Text as="p" tone="subdued">
            Pro: unlimited
          </Text>

          {isProPlan(capabilities) ? (
            <Text as="p" tone="subdued">
              Add-to-Cart tracking enabled
            </Text>
          ) : (
            <Text as="p" tone="subdued">
              Add-to-Cart tracking requires Pro
            </Text>
          )}
        </InlineStack>

        {limit !== null ? (
          <Text as="p" tone="subdued">
            Remaining campaigns: {remaining}
          </Text>
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
  const embeddedQuery = location.search || "";

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [capabilities, setCapabilities] = useState(getDefaultCapabilities());

  const [upgradeUrl, setUpgradeUrl] = useState("");
  const [basicUrl, setBasicUrl] = useState("");
  const [proUrl, setProUrl] = useState("");

  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState("qr");
  const [targetUrl, setTargetUrl] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");

  const [toast, setToast] = useState({
    active: false,
    content: "",
  });

  const [qrOpen, setQrOpen] = useState(false);
  const [qrValue, setQrValue] = useState("");
  const [qrTitle, setQrTitle] = useState("");

  const campaignCount = campaigns.length;
  const createAllowed = canCreateCampaign(capabilities, campaignCount);

  const showToast = useCallback((content) => {
    setToast({ active: true, content });
  }, []);

  const dismissToast = useCallback(() => {
    setToast((prev) => ({ ...prev, active: false }));
  }, []);

  const sourceOptions = useMemo(
    () => [
      { label: "QR code", value: "qr" },
      { label: "Tracking link", value: "link" },
      { label: "Packaging", value: "packaging" },
      { label: "Flyer", value: "flyer" },
      { label: "Influencer", value: "influencer" },
      { label: "Event", value: "event" },
    ],
    [],
  );

  const sourceLabelByValue = useMemo(() => {
    const map = {};

    for (const option of sourceOptions) {
      map[option.value] = option.label;
    }

    return map;
  }, [sourceOptions]);

  const rankedCampaigns = useMemo(() => {
    return campaigns.filter((campaign) => {
      return campaign?.id && hasCampaignSignal(campaign);
    });
  }, [campaigns]);

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
        const clicks = numberOrZero(campaign?.clicksCount);

        return {
          revenueCents: sum.revenueCents + revenueCents,
          costCents: sum.costCents + costCents,
          profitCents: sum.profitCents + profitCents,
          orders: sum.orders + orders,
          clicks: sum.clicks + clicks,
        };
      },
      {
        revenueCents: 0,
        costCents: 0,
        profitCents: 0,
        orders: 0,
        clicks: 0,
      },
    );

    return {
      ...totals,
      roi:
        totals.costCents > 0 ? totals.profitCents / totals.costCents : null,
      conversionRate:
        totals.clicks > 0 ? totals.orders / totals.clicks : null,
    };
  }, [campaigns]);

  const resetForm = useCallback(() => {
    setName("");
    setSourceType("qr");
    setTargetUrl("");
    setCost("");
    setNotes("");
  }, []);

  const loadCampaigns = useCallback(async () => {
    setErr("");
    setLoading(true);

    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `Load failed (${res.status})`);
      }

      const nextCampaigns = Array.isArray(data?.campaigns)
        ? data.campaigns
        : [];

      setCampaigns(nextCampaigns);

      const nextCapabilities = data?.capabilities
        ? data.capabilities
        : {
            ...getDefaultCapabilities(),
            campaignCount: nextCampaigns.length,
            remainingCampaigns: Math.max(
              FREE_CAMPAIGN_LIMIT - nextCampaigns.length,
              0,
            ),
            canCreateCampaign: nextCampaigns.length < FREE_CAMPAIGN_LIMIT,
          };

      setCapabilities(nextCapabilities);

      if (data?.upgradeUrl) setUpgradeUrl(data.upgradeUrl);
      if (data?.basicUrl) setBasicUrl(data.basicUrl);
      if (data?.proUrl) setProUrl(data.proUrl);
    } catch (e) {
      setErr(e?.message || "Could not load campaigns.");
    } finally {
      setLoading(false);
    }
  }, []);

  const createCampaign = useCallback(async () => {
    setErr("");
    setUpgradeUrl("");

    const trimmedName = name.trim();
    const trimmedTargetUrl = targetUrl.trim();

    if (!trimmedName) {
      setErr("Please enter a campaign name.");
      return;
    }

    if (!canCreateCampaign(capabilities, campaignCount)) {
      setErr(getPlanHelpText(capabilities, campaignCount));
      return;
    }

    const payload = {
      name: trimmedName,
      sourceType,
      cost,
      notes,
      ...(trimmedTargetUrl ? { targetUrl: trimmedTargetUrl } : {}),
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

          setErr(
            data.error ||
              "Your campaign limit has been reached. Upgrade to create more campaigns.",
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
                data?.canUseAddToCartTracking ??
                prev.canUseAddToCartTracking,
            }));
          }

          return;
        }

        throw new Error(data?.error || `Create failed (${res.status})`);
      }

      if (data?.capabilities) {
        setCapabilities(data.capabilities);
      }

      resetForm();
      showToast("Campaign created");
      await loadCampaigns();
    } catch (e) {
      setErr(e?.message || "Could not create campaign.");
    } finally {
      setLoading(false);
    }
  }, [
    name,
    sourceType,
    targetUrl,
    cost,
    notes,
    capabilities,
    campaignCount,
    resetForm,
    loadCampaigns,
    showToast,
  ]);

  const deleteCampaign = useCallback(
    async (campaignId, campaignName) => {
      const confirmed = window.confirm(
        `Delete campaign "${campaignName}"?\n\nThis will also remove its tracked events.`,
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
          throw new Error(data?.error || `Delete failed (${res.status})`);
        }

        showToast(`Campaign "${campaignName}" deleted`);
        await loadCampaigns();
      } catch (e) {
        setErr(e?.message || "Could not delete campaign.");
      } finally {
        setLoading(false);
      }
    },
    [loadCampaigns, showToast],
  );

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const rows = useMemo(() => {
    return campaigns.map((campaign) => {
      const token = campaign?.publicToken || "";
      const goUrl = token ? buildGoUrl(token) : "";
      const profitCents = getProfitCents(campaign);

      return [
        <BlockStack gap="050" key={`${campaign.id}-campaign`}>
          <Text as="span" fontWeight="semibold">
            {campaign?.name || "Untitled campaign"}
          </Text>

          {campaign?.targetUrl ? (
            <Text as="span" tone="subdued">
              {shorten(campaign.targetUrl, 52)}
            </Text>
          ) : (
            <Text as="span" tone="subdued">
              No destination URL yet
            </Text>
          )}
        </BlockStack>,

        sourceLabelByValue[campaign?.sourceType] || campaign?.sourceType || "—",

        campaign?.clicksCount ?? 0,

        campaign?.ordersCount ?? 0,

        formatMoneyFromCents(campaign?.revenueCents || 0),

        formatMoneyFromCents(profitCents),

        formatPercent(campaign?.roi),

        goUrl ? (
          <InlineStack gap="200" wrap={false}>
            <Button
              size="slim"
              onClick={async () => {
                const ok = await safeCopy(goUrl);
                showToast(ok ? "Tracking link copied" : "Copy failed");
              }}
            >
              Copy link
            </Button>

            <Link
              to={`/app/campaigns/${campaign.id}${embeddedQuery}`}
              style={{ textDecoration: "none" }}
            >
              <Button size="slim" variant="secondary">
                Details
              </Button>
            </Link>

            <Button
              size="slim"
              onClick={() => {
                setQrValue(goUrl);
                setQrTitle(campaign?.name || "Campaign");
                setQrOpen(true);
              }}
            >
              QR code
            </Button>

            <Button
              size="slim"
              tone="critical"
              onClick={() => deleteCampaign(campaign.id, campaign.name)}
            >
              Delete
            </Button>
          </InlineStack>
        ) : (
          "—"
        ),
      ];
    });
  }, [
    campaigns,
    sourceLabelByValue,
    showToast,
    deleteCampaign,
    embeddedQuery,
  ]);

  return (
    <Frame>
      <Page title="WhatSells" subtitle="Campaign tracking for Shopify">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <InlineStack gap="400" align="space-between" wrap>
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h2">
                        Dashboard
                      </Text>

                      <Text as="p" tone="subdued">
                        See which campaign links and QR codes create clicks,
                        orders and revenue.
                      </Text>
                    </BlockStack>

                    <Button onClick={loadCampaigns} loading={loading}>
                      Refresh data
                    </Button>
                  </InlineStack>

                  <PlanStatusCard
                    capabilities={capabilities}
                    campaignCount={campaignCount}
                    upgradeUrl={upgradeUrl || basicUrl}
                    proUrl={proUrl}
                  />

                  {err ? (
                    <Banner
                      tone={upgradeUrl || proUrl || basicUrl ? "warning" : "critical"}
                      onDismiss={() => {
                        setErr("");
                        setUpgradeUrl("");
                      }}
                    >
                      <BlockStack gap="200">
                        <Text as="p">{err}</Text>

                        {upgradeUrl || proUrl || basicUrl ? (
                          <InlineStack gap="200">
                            <Button
                              variant="primary"
                              onClick={() => {
                                window.open(
                                  proUrl || upgradeUrl || basicUrl,
                                  "_top",
                                );
                              }}
                            >
                              {getUpgradeButtonLabel(capabilities)}
                            </Button>
                          </InlineStack>
                        ) : null}
                      </BlockStack>
                    </Banner>
                  ) : null}

                  <InlineStack gap="300" wrap>
                    <MetricCard
                      label="Revenue"
                      value={formatMoneyFromCents(overview.revenueCents)}
                      helpText="Tracked revenue"
                    />

                    <MetricCard
                      label="Orders"
                      value={String(overview.orders)}
                      helpText="Attributed orders"
                    />

                    <MetricCard
                      label="Profit"
                      value={formatMoneyFromCents(overview.profitCents)}
                      helpText="Revenue minus cost"
                    />

                    <MetricCard
                      label="ROI"
                      value={formatPercent(overview.roi)}
                      helpText="Profit divided by cost"
                    />
                  </InlineStack>

                  <InlineStack gap="300" wrap>
                    <CampaignHighlightCard
                      title="Top campaign"
                      campaign={topCampaign}
                      emptyText="No campaign performance data yet."
                    />

                    <CampaignHighlightCard
                      title="Needs attention"
                      campaign={attentionCampaign}
                      emptyText="No campaign needs attention yet."
                    />
                  </InlineStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      Create campaign
                    </Text>

                    <Text as="p" tone="subdued">
                      Create a tracking link or QR campaign and send visitors to
                      your Shopify product page.
                    </Text>
                  </BlockStack>

                  {!createAllowed ? (
                    <Banner tone="warning">
                      <BlockStack gap="200">
                        <Text as="p">{getPlanHelpText(capabilities, campaignCount)}</Text>

                        {upgradeUrl || proUrl || basicUrl ? (
                          <Button
                            variant="primary"
                            onClick={() => {
                              window.open(
                                proUrl || upgradeUrl || basicUrl,
                                "_top",
                              );
                            }}
                          >
                            {getUpgradeButtonLabel(capabilities)}
                          </Button>
                        ) : null}
                      </BlockStack>
                    </Banner>
                  ) : null}

                  <InlineStack gap="300" wrap align="start">
                    <div style={{ minWidth: 260, flex: 1 }}>
                      <TextField
                        label="Campaign name"
                        value={name}
                        onChange={setName}
                        autoComplete="off"
                        placeholder="e.g. TikTok creator, flyer drop, packaging insert"
                        disabled={!createAllowed}
                      />
                    </div>

                    <div style={{ minWidth: 210 }}>
                      <Select
                        label="Campaign type"
                        options={sourceOptions}
                        value={sourceType}
                        onChange={setSourceType}
                        disabled={!createAllowed}
                      />
                    </div>

                    <div style={{ minWidth: 340, flex: 1 }}>
                      <TextField
                        label="Destination URL"
                        value={targetUrl}
                        onChange={setTargetUrl}
                        autoComplete="off"
                        placeholder="https://your-shop.com/products/..."
                        helpText="Where visitors go after clicking this tracking link."
                        disabled={!createAllowed}
                      />
                    </div>

                    <div style={{ minWidth: 180 }}>
                      <TextField
                        label="Campaign cost (€)"
                        value={cost}
                        onChange={setCost}
                        autoComplete="off"
                        placeholder="e.g. 250"
                        helpText="Optional. Used for profit and ROI."
                        disabled={!createAllowed}
                      />
                    </div>

                    <div style={{ minWidth: 280, flex: 1 }}>
                      <TextField
                        label="Notes"
                        value={notes}
                        onChange={setNotes}
                        autoComplete="off"
                        placeholder="e.g. 300 packaging inserts or creator deal"
                        disabled={!createAllowed}
                      />
                    </div>

                    <div style={{ alignSelf: "end" }}>
                      <Button
                        variant="primary"
                        onClick={createCampaign}
                        loading={loading}
                        disabled={!name.trim() || !createAllowed}
                      >
                        {getCreateButtonLabel(capabilities, campaignCount)}
                      </Button>
                    </div>
                  </InlineStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" gap="300" wrap>
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h2">
                        Campaigns
                      </Text>

                      <Text as="p" tone="subdued">
                        Start with {FREE_CAMPAIGN_LIMIT} free campaigns. Basic
                        includes up to {BASIC_CAMPAIGN_LIMIT} campaigns. Pro
                        Analytics unlocks unlimited campaigns and Add-to-Cart
                        tracking.
                      </Text>
                    </BlockStack>

                    <Badge tone={getPlanBadgeTone(capabilities)}>
                      {getPlanHeadline(capabilities, campaignCount)}
                    </Badge>
                  </InlineStack>

                  {campaigns.length ? (
                    <DataTable
                      columnContentTypes={[
                        "text",
                        "text",
                        "numeric",
                        "numeric",
                        "text",
                        "text",
                        "text",
                        "text",
                      ]}
                      headings={[
                        "Campaign",
                        "Type",
                        "Clicks",
                        "Orders",
                        "Revenue",
                        "Profit",
                        "ROI",
                        "Actions",
                      ]}
                      rows={rows}
                    />
                  ) : (
                    <Banner tone="info">
                      No campaigns yet. Create your first campaign to generate a
                      tracking link and QR code.
                    </Banner>
                  )}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">
                    Order tracking status
                  </Text>

                  <Text as="p" tone="subdued">
                    Orders are attributed when a customer completes checkout
                    after visiting your store through a WhatSells tracking link.
                    Open campaign details to view attributed orders and recent
                    tracking events.
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <InlineStack gap="200" wrap>
                    <Badge tone={isProPlan(capabilities) ? "success" : "attention"}>
                      Add-to-Cart tracking
                    </Badge>

                    <Text as="p" fontWeight="semibold">
                      {isProPlan(capabilities)
                        ? "Available in your Pro plan"
                        : "Available with Pro Analytics"}
                    </Text>
                  </InlineStack>

                  <Text as="p" tone="subdued">
                    Add-to-Cart tracking will show which campaigns create cart
                    intent before an order happens. This is the next Pro layer:
                    click → add-to-cart → order.
                  </Text>
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
    </Frame>
  );
}