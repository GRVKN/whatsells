import { useLoaderData } from "react-router";
import db from "../db.server";
import {
  authenticate,
  addDocumentResponseHeaders,
} from "../shopify.server";
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
} from "@shopify/polaris";

const TRACK_BASE_URL =
  process.env.TRACK_BASE_URL || "https://app.whatsells.dev";

export const headers = (headersArgs) => {
  return addDocumentResponseHeaders(headersArgs);
};

// ----------------------
// Format helpers
// ----------------------
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

function formatDateShort(value) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
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

// ----------------------
// KPI helpers
// ----------------------
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

  const profitCents = calcProfit(costCents, revenueCents);
  return profitCents / cost;
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

// ----------------------
// Range helpers
// ----------------------
function getRangeStart(range) {
  const now = new Date();

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

function normalizeRange(value) {
  if (value === "7d" || value === "30d" || value === "all") {
    return value;
  }

  return "7d";
}

function getRangeLabel(range) {
  if (range === "7d") return "Last 7 days";
  if (range === "30d") return "Last 30 days";
  return "All time";
}

// ----------------------
// Ranking helpers
// ----------------------
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
  const rankIndex = ranked.findIndex((campaign) => campaign.id === currentCampaignId);
  const rank = rankIndex >= 0 ? rankIndex + 1 : null;

  const isBestCampaign = rank === 1 && totalRankedCampaigns > 0;
  const isWorstCampaign =
    rank === totalRankedCampaigns && totalRankedCampaigns > 1;

  let performanceLabel = "Not ranked yet";

  if (isBestCampaign) {
    performanceLabel = "Best campaign";
  } else if (isWorstCampaign) {
    performanceLabel = "Worst campaign";
  } else if (rank) {
    performanceLabel = `Rank #${rank}`;
  }

  return {
    rank,
    totalRankedCampaigns,
    isBestCampaign,
    isWorstCampaign,
    performanceLabel,
  };
}

// ----------------------
// Chart helpers
// ----------------------
function getDateKey(value) {
  const d = new Date(value);
  return d.toISOString().slice(0, 10);
}

function buildDailyChartData(events) {
  const map = new Map();

  for (const event of events) {
    const key = getDateKey(event.createdAt);

    if (!map.has(key)) {
      map.set(key, {
        date: key,
        label: formatDateShort(event.createdAt),
        clicks: 0,
        orders: 0,
        revenueCents: 0,
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

  return [...map.values()].sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}

function buildRangeUrl(campaignId, range) {
  return `/app/campaigns/${campaignId}?range=${range}`;
}

// ----------------------
// Loader
// ----------------------
export async function loader({ request, params }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const id = String(params.id || "").trim();

  if (!id) {
    throw new Response("Missing campaign id", { status: 400 });
  }

  const url = new URL(request.url);
  const range = normalizeRange(url.searchParams.get("range"));
  const rangeStart = getRangeStart(range);

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

  const [
    clicks7d,
    clicks30d,
    rangeClicks,
    rangeOrders,
    rangeRevenueRaw,
    recentEvents,
    chartEvents,
    allCampaigns,
  ] = await Promise.all([
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

    db.event.count({
      where: {
        ...eventWhere,
        type: "click",
      },
    }),

    db.event.count({
      where: {
        ...eventWhere,
        type: "purchase",
      },
    }),

    db.event.aggregate({
      where: {
        ...eventWhere,
        type: "purchase",
      },
      _sum: {
        valueCents: true,
      },
    }),

    db.event.findMany({
      where: eventWhere,
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        type: true,
        createdAt: true,
        referer: true,
        lang: true,
        ipHash: true,
        valueCents: true,
        currency: true,
        orderId: true,
      },
    }),

    db.event.findMany({
      where: eventWhere,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        createdAt: true,
        valueCents: true,
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
  ]);

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

  const rangeRevenueCents = numberOrZero(rangeRevenueRaw?._sum?.valueCents);
  const rangeProfitCents = calcProfit(campaign.costCents, rangeRevenueCents);
  const rangeConversionRate = calcConversionRate(rangeClicks, rangeOrders);
  const rangeRoi = calcRoi(campaign.costCents, rangeRevenueCents);
  const rangeRoas = calcRoas(campaign.costCents, rangeRevenueCents);

  const ranking = getCampaignRanking(allCampaigns, campaign.id);
  const chartData = buildDailyChartData(chartEvents);

  return {
    range,
    rangeLabel: getRangeLabel(range),
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
    chartData,
    recentEvents,
  };
}

// ----------------------
// Small UI components
// ----------------------
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

function SimpleBarChart({ title, data, metric, valueFormatter }) {
  const maxValue = Math.max(
    ...data.map((row) => numberOrZero(row[metric])),
    1,
  );

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">
          {title}
        </Text>

        {data.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {data.map((row) => {
              const value = numberOrZero(row[metric]);
              const width = Math.max((value / maxValue) * 100, value > 0 ? 4 : 0);

              return (
                <div
                  key={`${metric}-${row.date}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "70px 1fr 80px",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Text as="span" tone="subdued">
                    {row.label}
                  </Text>

                  <div
                    style={{
                      height: 12,
                      background: "#eee",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${width}%`,
                        background: "#111",
                        borderRadius: 999,
                      }}
                    />
                  </div>

                  <Text as="span" alignment="end">
                    {valueFormatter ? valueFormatter(value) : value}
                  </Text>
                </div>
              );
            })}
          </div>
        ) : (
          <Text as="p" tone="subdued">
            No data for this range yet.
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}

// ----------------------
// Component
// ----------------------
export default function CampaignDetails() {
  const { campaign, range, rangeLabel, rangeStats, chartData, recentEvents } =
    useLoaderData();

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
      : "info";

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
                      tone={campaign.status === "active" ? "success" : "attention"}
                    >
                      {campaign.status}
                    </Badge>

                    <Badge tone="info">{campaign.sourceType}</Badge>
                  </InlineStack>
                </BlockStack>

                <BlockStack gap="150" align="end">
                  <Badge tone={rankingTone}>{campaign.performanceLabel}</Badge>

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

              <InlineStack gap="200">
                <Button
                  pressed={range === "7d"}
                  url={buildRangeUrl(campaign.id, "7d")}
                >
                  7 days
                </Button>

                <Button
                  pressed={range === "30d"}
                  url={buildRangeUrl(campaign.id, "30d")}
                >
                  30 days
                </Button>

                <Button
                  pressed={range === "all"}
                  url={buildRangeUrl(campaign.id, "all")}
                >
                  All time
                </Button>
              </InlineStack>

              <Text as="p" tone="subdued">
                Current filter: {rangeLabel}
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
          <BlockStack gap="300">
            <SimpleBarChart
              title="Clicks over time"
              data={chartData}
              metric="clicks"
            />

            <SimpleBarChart
              title="Orders over time"
              data={chartData}
              metric="orders"
            />

            <SimpleBarChart
              title="Revenue over time"
              data={chartData}
              metric="revenueCents"
              valueFormatter={formatMoneyFromCents}
            />
          </BlockStack>
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
                  ["Revenue total", formatMoneyFromCents(campaign.revenueCents || 0)],
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