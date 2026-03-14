import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import CampaignQr from "../CampaignQr.jsx";
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
} from "@shopify/polaris";


// ----------------------
// helpers
// ----------------------
function formatDateTime(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

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

function formatRatio(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return `${Number(value).toFixed(2)}x`;
}

function shorten(text, max = 55) {
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

// ----------------------
// component
// ----------------------
export default function AppIndex() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [campaigns, setCampaigns] = useState([]);

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

  const showToast = useCallback((content) => {
    setToast({ active: true, content });
  }, []);

  const dismissToast = useCallback(() => {
    setToast((prev) => ({ ...prev, active: false }));
  }, []);

  const sourceOptions = useMemo(
    () => [
      { label: "QR", value: "qr" },
      { label: "Link", value: "link" },
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

    const bestCampaign = useMemo(() => {
    const valid = campaigns.filter(
      (campaign) => campaign?.roi !== null && campaign?.roi !== undefined,
    );

    if (!valid.length) return null;

    return [...valid].sort((a, b) => Number(b.roi) - Number(a.roi))[0];
  }, [campaigns]);

  const worstCampaign = useMemo(() => {
    const valid = campaigns.filter(
      (campaign) => campaign?.roi !== null && campaign?.roi !== undefined,
    );

    if (!valid.length) return null;

    return [...valid].sort((a, b) => Number(a.roi) - Number(b.roi))[0];
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

      setCampaigns(Array.isArray(data?.campaigns) ? data.campaigns : []);
    } catch (e) {
      setErr(e?.message || "Could not load campaigns.");
    } finally {
      setLoading(false);
    }
  }, []);

  const createCampaign = useCallback(async () => {
    setErr("");

    const trimmedName = name.trim();
    const trimmedTargetUrl = targetUrl.trim();

    if (!trimmedName) {
      setErr("Please enter a campaign name.");
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
        throw new Error(data?.error || `Create failed (${res.status})`);
      }

      resetForm();
      showToast("Campaign created");
      await loadCampaigns();
    } catch (e) {
      setErr(e?.message || "Could not create campaign.");
    } finally {
      setLoading(false);
    }
  }, [name, sourceType, targetUrl, cost, notes, resetForm, loadCampaigns, showToast]);

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
    const target = campaign?.targetUrl || "";

      return [
        campaign?.name || "",
        sourceLabelByValue[campaign?.sourceType] || campaign?.sourceType || "",
        campaign?.clicks7d ?? 0,
        campaign?.clicks30d ?? 0,
        campaign?.clicksCount ?? 0,
        campaign?.ordersCount ?? 0,
        formatPercent(campaign?.conversionRate),
        formatMoneyFromCents(campaign?.revenueCents || 0),
        formatMoneyFromCents(campaign?.costCents || 0),
        formatMoneyFromCents(campaign?.profitCents || 0),
        formatPercent(campaign?.roi),
        formatRatio(campaign?.roas),
        campaign?.breakEvenOrders ?? "—",
        shorten(target, 60),
        formatDateTime(campaign?.createdAt),
      goUrl ? (
        <InlineStack gap="200" wrap={false}>
          <Button
            size="slim"
            onClick={async () => {
              const ok = await safeCopy(goUrl);
              showToast(ok ? "Go link copied" : "Copy failed");
            }}
          >
            Copy
          </Button>

<Button
  size="slim"
  variant="secondary"
  onClick={() => navigate(`/app/campaigns/${campaign.id}`)}
>
  Open details
</Button>

          <Button
            size="slim"
            onClick={() => {
              setQrValue(goUrl);
              setQrTitle(campaign?.name || "Campaign");
              setQrOpen(true);
            }}
          >
            Show QR
          </Button>
        </InlineStack>
      ) : (
        ""
      ),
      <Button
        size="slim"
        tone="critical"
        onClick={() => deleteCampaign(campaign.id, campaign.name)}
      >
        Delete
      </Button>,
    ];
  });
}, [campaigns, sourceLabelByValue, showToast, deleteCampaign, navigate]);

  return (
    <>
      <Page title="WhatSells">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="400" align="space-between">
                  <Text variant="headingMd" as="h2">
                    Campaigns
                  </Text>

                  <Button onClick={loadCampaigns} loading={loading}>
                    Update live
                  </Button>
                </InlineStack>

                {err ? (
                  <Banner tone="critical" onDismiss={() => setErr("")}>
                    {err}
                  </Banner>
                ) : null}

                                <InlineStack gap="300" wrap>
                  <div style={{ minWidth: 260, flex: 1 }}>
                    <Card>
                      <BlockStack gap="100">
                        <Text variant="headingSm" as="h3">
                          Best campaign
                        </Text>
                        {bestCampaign ? (
                          <>
                            <Text as="p">{bestCampaign.name}</Text>
                            <Text as="p" tone="subdued">
                              ROI: {formatPercent(bestCampaign.roi)} · Revenue:{" "}
                              {formatMoneyFromCents(bestCampaign.revenueCents || 0)}
                            </Text>
                          </>
                        ) : (
                          <Text as="p" tone="subdued">
                            No ROI data yet.
                          </Text>
                        )}
                      </BlockStack>
                    </Card>
                  </div>

                  <div style={{ minWidth: 260, flex: 1 }}>
                    <Card>
                      <BlockStack gap="100">
                        <Text variant="headingSm" as="h3">
                          Worst campaign
                        </Text>
                        {worstCampaign ? (
                          <>
                            <Text as="p">{worstCampaign.name}</Text>
                            <Text as="p" tone="subdued">
                              ROI: {formatPercent(worstCampaign.roi)} · Revenue:{" "}
                              {formatMoneyFromCents(worstCampaign.revenueCents || 0)}
                            </Text>
                          </>
                        ) : (
                          <Text as="p" tone="subdued">
                            No ROI data yet.
                          </Text>
                        )}
                      </BlockStack>
                    </Card>
                  </div>
                </InlineStack>

                <InlineStack gap="300" wrap align="start">
                  <div style={{ minWidth: 260, flex: 1 }}>
                    <TextField
                      label="Campaign name"
                      value={name}
                      onChange={setName}
                      autoComplete="off"
                      placeholder="e.g. Packaging insert, Spring flyer, TikTok creator..."
                    />
                  </div>

                  <div style={{ minWidth: 200 }}>
                    <Select
                      label="Source"
                      options={sourceOptions}
                      value={sourceType}
                      onChange={setSourceType}
                    />
                  </div>

                  <div style={{ minWidth: 340, flex: 1 }}>
                    <TextField
                      label="Target URL"
                      value={targetUrl}
                      onChange={setTargetUrl}
                      autoComplete="off"
                      placeholder="https://your-shop.com/products/..."
                      helpText="Destination page for this campaign. WhatSells tracks the go link and redirects visitors here."
                    />
                  </div>

                  <div style={{ minWidth: 160 }}>
                    <TextField
                      label="Cost (€)"
                      value={cost}
                      onChange={setCost}
                      autoComplete="off"
                      placeholder="e.g. 250"
                    />
                  </div>

                  <div style={{ minWidth: 280, flex: 1 }}>
                    <TextField
                      label="Notes (optional)"
                      value={notes}
                      onChange={setNotes}
                      autoComplete="off"
                      placeholder="e.g. 300 packaging inserts / creator deal / local flyer drop"
                    />
                  </div>

                  <div style={{ alignSelf: "end" }}>
                    <Button
                      variant="primary"
                      onClick={createCampaign}
                      loading={loading}
                      disabled={!name.trim()}
                    >
                      Create campaign
                    </Button>
                  </div>
                </InlineStack>

<DataTable
  columnContentTypes={[
    "text",
    "text",
    "numeric",
    "numeric",
    "numeric",
    "numeric",
    "text",
    "text",
    "text",
    "text",
    "text",
    "text",
    "numeric",
    "text",
    "text",
    "text",
    "text",
  ]}
  headings={[
    "Name",
    "Source",
    "Clicks 7d",
    "Clicks 30d",
    "Clicks total",
    "Orders",
    "Conversion",
    "Revenue",
    "Cost",
    "Profit",
    "ROI",
    "ROAS",
    "Break-even orders",
    "Target URL",
    "Created",
    "Go Link",
    "Actions",
  ]}
  rows={rows}
/>

<Text variant="bodySm" as="p" tone="subdued">
  Clicks 7d and 30d show recent activity. Clicks total, ROI, ROAS and break-even orders show long-term campaign performance.
</Text>
              </BlockStack>
            </Card>
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
    </>
  );
}