import { useEffect, useState } from "react";
import { useLoaderData, useLocation } from "react-router";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import CampaignPerformanceChart from "../components/CampaignPerformanceChart";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  DataTable,
  Badge,
  Button,
  Banner,
} from "@shopify/polaris";

const TRACK_BASE_URL =
  process.env.TRACK_BASE_URL || "https://app.whatsells.dev";

function formatDateTime(value) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "—";
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

function numberOrZero(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function calcProfit(costCents, revenueCents) {
  return numberOrZero(revenueCents) - numberOrZero(costCents);
}

function calcRoas(costCents, revenueCents) {
  const cost = numberOrZero(costCents);

  if (cost <= 0) return null;

  return numberOrZero(revenueCents) / cost;
}

function calcRoi(costCents, revenueCents) {
  const cost = numberOrZero(costCents);

  if (cost <= 0) return null;

  return calcProfit(costCents, revenueCents) / cost;
}

function calcConversionRate(clicks, orders) {
  const totalClicks = numberOrZero(clicks);

  if (totalClicks <= 0) return 0;

  return numberOrZero(orders) / totalClicks;
}

function calcAverageOrderValue(revenueCents, orders) {
  const totalOrders = numberOrZero(orders);

  if (totalOrders <= 0) return null;

  return Math.round(numberOrZero(revenueCents) / totalOrders);
}

function calcBreakEvenOrders(costCents, avgOrderValueCents) {
  const cost = numberOrZero(costCents);
  const avgOrder = numberOrZero(avgOrderValueCents);

  if (cost <= 0) return 0;
  if (avgOrder <= 0) return null;

  return Math.ceil(cost / avgOrder);
}

function normalizeRange(value) {
  if (
    value === "live" ||
    value === "24h" ||
    value === "7d" ||
    value === "30d" ||
    value === "all"
  ) {
    return value;
  }

  return "30d";
}

function getRangeStart(range) {
  const now = new Date();

  if (range === "live") {
    const d = new Date(now);
    d.setMinutes(d.getMinutes() - 60);
    return d;
  }

  if (range === "24h") {
    const d = new Date(now);
    d.setHours(d.getHours() - 24);
    return d;
  }

  if (range === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }

  if (range === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }

  return null;
}

function getRangeLabel(range) {
  if (range === "live") return "Live · last 60 minutes";
  if (range === "24h") return "Last 24 hours";
  if (range === "7d") return "Last 7 days";
  if (range === "30d") return "Last 30 days";

  return "All time";
}

function getBucketForRange(range) {
  if (range === "live") return "minute";
  if (range === "24h") return "hour";
  if (range === "all") return "month";

  return "day";
}

function startOfHour(date) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfTenMinuteBucket(date) {
  const d = new Date(date);
  const minutes = d.getMinutes();
  d.setMinutes(Math.floor(minutes / 10) * 10, 0, 0);
  return d;
}

function getBucketDate(date, bucket) {
  if (bucket === "minute") return startOfTenMinuteBucket(date);
  if (bucket === "hour") return startOfHour(date);
  if (bucket === "month") return startOfMonth(date);

  return startOfDay(date);
}

function buildRangeUrl(campaignId, range, currentSearch = "") {
  const params = new URLSearchParams(currentSearch || "");
  params.set("range", range);

  return `/app/campaigns/${campaignId}?${params.toString()}`;
}

function hasPerformanceSignal(campaign) {
  return (
    numberOrZero(campaign.costCents) > 0 ||
    numberOrZero(campaign.revenueCents) > 0 ||
    numberOrZero(campaign.ordersCount) > 0 ||
    numberOrZero(campaign.clicksCount) > 0
  );
}

function compareCampaignPerformance(a, b) {
  const aProfit = calcProfit(a.costCents, a.revenueCents);
  const bProfit = calcProfit(b.costCents, b.revenueCents);

  const aRoi = calcRoi(a.costCents, a.revenueCents) ?? 0;
  const bRoi = calcRoi(b.costCents, b.revenueCents) ?? 0;

  const aRoas = calcRoas(a.costCents, a.revenueCents) ?? 0;
  const bRoas = calcRoas(b.costCents, b.revenueCents) ?? 0;

  const checks = [
    bProfit - aProfit,
    bRoi - aRoi,
    numberOrZero(b.revenueCents) - numberOrZero(a.revenueCents),
    numberOrZero(b.ordersCount) - numberOrZero(a.ordersCount),
    bRoas - aRoas,
    numberOrZero(b.clicksCount) - numberOrZero(a.clicksCount),
    numberOrZero(a.costCents) - numberOrZero(b.costCents),
  ];

  return checks.find((value) => value !== 0) || 0;
}

function getCampaignRanking(allCampaigns, currentCampaignId) {
  const ranked = allCampaigns
    .filter(hasPerformanceSignal)
    .sort(compareCampaignPerformance);

  const totalRankedCampaigns = ranked.length;
  const rankIndex = ranked.findIndex(
    (campaign) => campaign.id === currentCampaignId,
  );

  const rank = rankIndex >= 0 ? rankIndex + 1 : null;

  const current = ranked.find((campaign) => campaign.id === currentCampaignId);
  const currentProfit = current
    ? calcProfit(current.costCents, current.revenueCents)
    : 0;

  const isBestCampaign =
    rank === 1 && totalRankedCampaigns > 0 && currentProfit > 0;

  const isTopRanked =
    rank === 1 && totalRankedCampaigns > 0 && currentProfit <= 0;

  const isWorstCampaign =
    rank === totalRankedCampaigns && totalRankedCampaigns > 1;

  let performanceLabel = "Needs data";

  if (isBestCampaign) {
    performanceLabel = "Best campaign";
  } else if (isTopRanked) {
    performanceLabel = "Top ranked";
  } else if (isWorstCampaign) {
    performanceLabel = "Worst campaign";
  } else if (rank) {
    performanceLabel = `Rank #${rank}`;
  }

  return {
    rank,
    totalRankedCampaigns,
    isBestCampaign,
    isTopRanked,
    isWorstCampaign,
    performanceLabel,
  };
}

function buildChartRows(events, bucket, campaignCostCents) {
  const map = new Map();

  for (const event of events) {
    const bucketDate = getBucketDate(event.createdAt, bucket);
    const key = bucketDate.toISOString();

    if (!map.has(key)) {
      map.set(key, {
        date: key,
        clicks: 0,
        orders: 0,
        revenueCents: 0,
        profitCents: 0,
      });
    }

    const row = map.get(key);

    if (event.type === "click") {
      row.clicks += 1;
    }

    if (event.type === "purchase") {
      row.orders += 1;
      row.revenueCents += numberOrZero(event.valueCents);
    }
  }

  const rows = [...map.values()].sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  return rows.map((row) => ({
    ...row,
    profitCents: row.revenueCents - numberOrZero(campaignCostCents),
  }));
}

function getMetricLabel(metric) {
  if (metric === "orders") return "Orders";
  if (metric === "revenueCents") return "Revenue";
  if (metric === "profitCents") return "Profit";

  return "Clicks";
}

export async function loader({ request, params }) {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const id = String(params.id || "").trim();

    if (!id) {
      throw new Response("Missing campaign id", { status: 400 });
    }

    const url = new URL(request.url);
    const range = normalizeRange(url.searchParams.get("range"));
    const rangeStart = getRangeStart(range);
    const bucket = getBucketForRange(range);

    const campaign = await db.campaign.findFirst({
      where: { id, shop },
      select: {
        id: true,
        shop: true,
        publicToken: true,
        name: true,
        sourceType: true,
        targetUrl: true,
        costCents: true,
        clicksCount: true,
        revenueCents: true,
        ordersCount: true,
        notes: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!campaign) {
      throw new Response("Campaign not found", { status: 404 });
    }

    const eventWhere = {
      campaignId: campaign.id,
      ...(rangeStart ? { createdAt: { gte: rangeStart } } : {}),
    };

    const [events, allCampaigns, clicks7d, clicks30d] = await Promise.all([
      db.event.findMany({
        where: eventWhere,
        orderBy: { createdAt: "asc" },
        take: range === "all" ? 3000 : 1000,
        select: {
          id: true,
          type: true,
          createdAt: true,
          referer: true,
          lang: true,
          valueCents: true,
          currency: true,
          orderId: true,
        },
      }),

      db.campaign.findMany({
        where: { shop },
        select: {
          id: true,
          name: true,
          costCents: true,
          clicksCount: true,
          revenueCents: true,
          ordersCount: true,
          createdAt: true,
        },
      }),

      db.event.count({
        where: {
          campaignId: campaign.id,
          type: "click",
          createdAt: { gte: getRangeStart("7d") },
        },
      }),

      db.event.count({
        where: {
          campaignId: campaign.id,
          type: "click",
          createdAt: { gte: getRangeStart("30d") },
        },
      }),
    ]);

    const rangeClicks = events.filter((event) => event.type === "click").length;
    const rangeOrders = events.filter((event) => event.type === "purchase").length;

    const rangeRevenueCents = events.reduce((sum, event) => {
      if (event.type !== "purchase") return sum;

      return sum + numberOrZero(event.valueCents);
    }, 0);

    const profitCents = calcProfit(campaign.costCents, campaign.revenueCents);

    const conversionRate = calcConversionRate(
      campaign.clicksCount,
      campaign.ordersCount,
    );

    const averageOrderValueCents = calcAverageOrderValue(
      campaign.revenueCents,
      campaign.ordersCount,
    );

    const roi = calcRoi(campaign.costCents, campaign.revenueCents);
    const roas = calcRoas(campaign.costCents, campaign.revenueCents);

    const breakEvenOrders = calcBreakEvenOrders(
      campaign.costCents,
      averageOrderValueCents,
    );

    const rangeProfitCents = calcProfit(campaign.costCents, rangeRevenueCents);
    const rangeConversionRate = calcConversionRate(rangeClicks, rangeOrders);
    const rangeRoi = calcRoi(campaign.costCents, rangeRevenueCents);
    const rangeRoas = calcRoas(campaign.costCents, rangeRevenueCents);

    const ranking = getCampaignRanking(allCampaigns, campaign.id);

    const chartRows = buildChartRows(
      events,
      bucket,
      campaign.costCents,
    );

    return {
      loadError: null,
      range,
      rangeLabel: getRangeLabel(range),
      bucket,
      campaign: {
        ...campaign,
        clicks7d,
        clicks30d,
        profitCents,
        conversionRate,
        averageOrderValueCents,
        roi,
        roas,
        breakEvenOrders,
        goUrl: `${TRACK_BASE_URL}/go/${campaign.publicToken}`,
        ...ranking,
      },
      rangeStats: {
        clicks: rangeClicks,
        orders: rangeOrders,
        revenueCents: rangeRevenueCents,
        profitCents: rangeProfitCents,
        conversionRate: rangeConversionRate,
        roi: rangeRoi,
        roas: rangeRoas,
      },
      chartRows,
      recentEvents: [...events].reverse().slice(0, 30),
    };
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    console.error("Campaign details loader failed:", error);

    return {
      loadError:
        error?.message || "Campaign details could not be loaded.",
      range: "30d",
      rangeLabel: "Last 30 days",
      bucket: "day",
      campaign: null,
      rangeStats: null,
      chartRows: [],
      recentEvents: [],
    };
  }
}

function KpiCard({ label, value, helpText }) {
  return (
    <div style={{ minWidth: 170, flex: 1 }}>
      <Card>
        <BlockStack gap="100">
          <Text variant="headingSm" as="h3">
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

function MetricButton({ active, children, onClick }) {
  return (
    <Button
      variant={active ? "primary" : "secondary"}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ChartTable({ rows }) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">
          Performance by period
        </Text>

        <DataTable
          columnContentTypes={["text", "numeric", "numeric", "text", "text"]}
          headings={["Period", "Clicks", "Orders", "Revenue", "Profit"]}
          rows={
            rows.length
              ? rows.map((row) => [
                  formatDateTime(row.date),
                  String(row.clicks),
                  String(row.orders),
                  formatMoneyFromCents(row.revenueCents),
                  formatMoneyFromCents(row.profitCents),
                ])
              : [["—", "—", "—", "—", "—"]]
          }
        />
      </BlockStack>
    </Card>
  );
}

export default function CampaignDetails() {
  const location = useLocation();

  const {
    loadError,
    campaign,
    range,
    rangeLabel,
    bucket,
    rangeStats,
    chartRows,
    recentEvents,
  } = useLoaderData();

  const [metric, setMetric] = useState("clicks");

  useEffect(() => {
    if (range !== "live") return;

    const interval = window.setInterval(() => {
      window.location.reload();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [range]);

  if (loadError || !campaign) {
    return (
      <Page
        title="Campaign details"
        backAction={{ content: "Campaigns", url: "/app" }}
      >
        <Layout>
          <Layout.Section>
            <Banner tone="critical">
              {loadError || "Campaign details could not be loaded."}
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const eventRows = recentEvents.map((event) => [
    formatDateTime(event.createdAt),
    event.type,
    event.referer || "—",
    event.lang || "—",
    event.orderId || "—",
    event.valueCents != null ? formatMoneyFromCents(event.valueCents) : "—",
  ]);

  const rankingTone = campaign.isBestCampaign
    ? "success"
    : campaign.isWorstCampaign
      ? "critical"
      : "attention";

  return (
    <Page
      title={campaign.name}
      subtitle={`Campaign details · ${campaign.sourceType}`}
      backAction={{ content: "Campaigns", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" gap="400">
                <BlockStack gap="150">
                  <Text as="p" tone="subdued">
                    Shop: {campaign.shop}
                  </Text>

                  <Text variant="headingLg" as="h1">
                    {campaign.name}
                  </Text>

                  <InlineStack gap="200">
                    <Badge
                      tone={
                        campaign.status === "active"
                          ? "success"
                          : "attention"
                      }
                    >
                      {campaign.status}
                    </Badge>

                    <Badge>{campaign.sourceType}</Badge>
                  </InlineStack>
                </BlockStack>

                <BlockStack gap="150">
                  <Badge tone={rankingTone}>
                    {campaign.performanceLabel}
                  </Badge>

                  {campaign.rank ? (
                    <Text as="p" tone="subdued">
                      Rank #{campaign.rank} of {campaign.totalRankedCampaigns}
                    </Text>
                  ) : (
                    <Text as="p" tone="subdued">
                      Not enough data to rank.
                    </Text>
                  )}

                  <Button url={campaign.goUrl} external>
                    Open live link
                  </Button>
                </BlockStack>
              </InlineStack>

              <InlineStack gap="200" wrap>
                <Button
                  variant={range === "live" ? "primary" : "secondary"}
                  url={buildRangeUrl(campaign.id, "live", location.search)}
                >
                  Live
                </Button>

                <Button
                  variant={range === "24h" ? "primary" : "secondary"}
                  url={buildRangeUrl(campaign.id, "24h", location.search)}
                >
                  24h
                </Button>

                <Button
                  variant={range === "7d" ? "primary" : "secondary"}
                  url={buildRangeUrl(campaign.id, "7d", location.search)}
                >
                  7 days
                </Button>

                <Button
                  variant={range === "30d" ? "primary" : "secondary"}
                  url={buildRangeUrl(campaign.id, "30d", location.search)}
                >
                  30 days
                </Button>

                <Button
                  variant={range === "all" ? "primary" : "secondary"}
                  url={buildRangeUrl(campaign.id, "all", location.search)}
                >
                  All time
                </Button>
              </InlineStack>

              <Text as="p" tone="subdued">
                Current filter: {rangeLabel}
                {range === "live" ? " · auto refresh every 30 seconds" : ""}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineStack gap="300" wrap>
            <KpiCard
              label="Clicks"
              value={String(rangeStats.clicks)}
              helpText={rangeLabel}
            />

            <KpiCard
              label="Orders"
              value={String(rangeStats.orders)}
              helpText={rangeLabel}
            />

            <KpiCard
              label="Conversion"
              value={formatPercent(rangeStats.conversionRate)}
              helpText="Orders / Clicks"
            />

            <KpiCard
              label="Revenue"
              value={formatMoneyFromCents(rangeStats.revenueCents)}
              helpText={rangeLabel}
            />

            <KpiCard
              label="Profit"
              value={formatMoneyFromCents(rangeStats.profitCents)}
              helpText="Revenue - Campaign cost"
            />

            <KpiCard
              label="ROI"
              value={formatPercent(rangeStats.roi)}
              helpText="Profit / Cost"
            />

            <KpiCard
              label="ROAS"
              value={formatRatio(rangeStats.roas)}
              helpText="Revenue / Cost"
            />
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" gap="300" wrap>
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h2">
                    {getMetricLabel(metric)} over time
                  </Text>

                  <Text as="p" tone="subdued">
                    {rangeLabel}
                  </Text>
                </BlockStack>

                <InlineStack gap="200" wrap>
                  <MetricButton
                    active={metric === "clicks"}
                    onClick={() => setMetric("clicks")}
                  >
                    Clicks
                  </MetricButton>

                  <MetricButton
                    active={metric === "orders"}
                    onClick={() => setMetric("orders")}
                  >
                    Orders
                  </MetricButton>

                  <MetricButton
                    active={metric === "revenueCents"}
                    onClick={() => setMetric("revenueCents")}
                  >
                    Revenue
                  </MetricButton>

                  <MetricButton
                    active={metric === "profitCents"}
                    onClick={() => setMetric("profitCents")}
                  >
                    Profit
                  </MetricButton>
                </InlineStack>
              </InlineStack>

              <CampaignPerformanceChart
                data={chartRows}
                metric={metric}
                bucket={bucket}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <ChartTable rows={chartRows} />
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Campaign metrics
              </Text>

              <DataTable
                columnContentTypes={["text", "text"]}
                headings={["Metric", "Value"]}
                rows={[
                  ["Clicks 7d", String(campaign.clicks7d ?? 0)],
                  ["Clicks 30d", String(campaign.clicks30d ?? 0)],
                  ["Clicks total", String(campaign.clicksCount ?? 0)],
                  ["Orders total", String(campaign.ordersCount ?? 0)],
                  ["Conversion total", formatPercent(campaign.conversionRate)],
                  [
                    "Revenue total",
                    formatMoneyFromCents(campaign.revenueCents || 0),
                  ],
                  ["Cost", formatMoneyFromCents(campaign.costCents || 0)],
                  ["Profit total", formatMoneyFromCents(campaign.profitCents || 0)],
                  ["ROI total", formatPercent(campaign.roi)],
                  ["ROAS total", formatRatio(campaign.roas)],
                  [
                    "Break-even orders",
                    campaign.breakEvenOrders != null
                      ? String(campaign.breakEvenOrders)
                      : "—",
                  ],
                  ["Created", formatDateTime(campaign.createdAt)],
                  ["Updated", formatDateTime(campaign.updatedAt)],
                  ["Target URL", campaign.targetUrl || "—"],
                  ["Public Token", campaign.publicToken || "—"],
                  ["Go Link", campaign.goUrl],
                  ["Notes", campaign.notes || "—"],
                ]}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                Recent events
              </Text>

              <DataTable
                columnContentTypes={[
                  "text",
                  "text",
                  "text",
                  "text",
                  "text",
                  "text",
                ]}
                headings={[
                  "Time",
                  "Type",
                  "Referer",
                  "Language",
                  "Order ID",
                  "Value",
                ]}
                rows={
                  eventRows.length
                    ? eventRows
                    : [["—", "—", "—", "—", "—", "—"]]
                }
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}