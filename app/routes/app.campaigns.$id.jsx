import { useLoaderData, useLocation } from "react-router";
import db from "../db.server";
import { authenticate } from "../shopify.server";
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
  if (value === "7d" || value === "30d" || value === "all") {
    return value;
  }

  return "7d";
}

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

function getRangeLabel(range) {
  if (range === "7d") return "Last 7 days";
  if (range === "30d") return "Last 30 days";
  return "All time";
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

function buildDailyRows(events) {
  const map = new Map();

  for (const event of events) {
    const dateKey = new Date(event.createdAt).toISOString().slice(0, 10);

    if (!map.has(dateKey)) {
      map.set(dateKey, {
        date: dateKey,
        label: formatDateShort(event.createdAt),
        clicks: 0,
        orders: 0,
        revenueCents: 0,
      });
    }

    const row = map.get(dateKey);

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

    const events = await db.event.findMany({
      where: eventWhere,
      orderBy: { createdAt: "desc" },
      take: 200,
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
    });

    const allCampaigns = await db.campaign.findMany({
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
    });

    const clicks7d = await db.event.count({
      where: {
        campaignId: campaign.id,
        type: "click",
        createdAt: { gte: getRangeStart("7d") },
      },
    });

    const clicks30d = await db.event.count({
      where: {
        campaignId: campaign.id,
        type: "click",
        createdAt: { gte: getRangeStart("30d") },
      },
    });

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
    const chartRows = buildDailyRows([...events].reverse());

    return {
      loadError: null,
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
      chartRows,
      recentEvents: events.slice(0, 30),
    };
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    console.error("Campaign details loader failed:", error);

    return {
      loadError:
        error?.message || "Campaign details could not be loaded.",
      range: "7d",
      rangeLabel: "Last 7 days",
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

function getMaxValue(rows, metric) {
  const values = rows.map((row) => numberOrZero(row[metric]));
  return Math.max(...values, 1);
}

function MiniBarChart({ title, rows, metric, formatter }) {
  const maxValue = getMaxValue(rows, metric);

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">
          {title}
        </Text>

        {rows.length ? (
          <BlockStack gap="250">
            {rows.map((row) => {
              const value = numberOrZero(row[metric]);
              const percent = Math.min((value / maxValue) * 100, 100);
              const width = value > 0 ? Math.max(percent, 4) : 0;

              return (
                <div
                  key={`${title}-${row.date}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "70px 1fr 90px",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <Text as="span" tone="subdued">
                    {row.label}
                  </Text>

                  <div
                    style={{
                      width: "100%",
                      height: "14px",
                      borderRadius: "999px",
                      background: "#e5e5e5",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${width}%`,
                        height: "100%",
                        borderRadius: "999px",
                        background: "#111111",
                        transition: "width 180ms ease",
                      }}
                    />
                  </div>

                  <Text as="span" alignment="end">
                    {formatter ? formatter(value) : String(value)}
                  </Text>
                </div>
              );
            })}
          </BlockStack>
        ) : (
          <Text as="p" tone="subdued">
            No data for this range yet.
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}

function ChartSection({ rows }) {
  return (
    <BlockStack gap="300">
      <MiniBarChart
        title="Clicks over time"
        rows={rows}
        metric="clicks"
      />

      <MiniBarChart
        title="Orders over time"
        rows={rows}
        metric="orders"
      />

      <MiniBarChart
        title="Revenue over time"
        rows={rows}
        metric="revenueCents"
        formatter={formatMoneyFromCents}
      />

      <Card>
        <BlockStack gap="300">
          <Text variant="headingMd" as="h2">
            Performance by day
          </Text>

          <DataTable
            columnContentTypes={["text", "numeric", "numeric", "text"]}
            headings={["Date", "Clicks", "Orders", "Revenue"]}
            rows={
              rows.length
                ? rows.map((row) => [
                    row.label,
                    String(row.clicks),
                    String(row.orders),

                    formatMoneyFromCents(row.revenueCents),
                  ])
                : [["—", "—", "—", "—"]]
            }
          />
        </BlockStack>
      </Card>
    </BlockStack>
  );
}


export default function CampaignDetails() {
  const location = useLocation();

  const {
    loadError,
    campaign,
    range,
    rangeLabel,
    rangeStats,
    chartRows,
    recentEvents,
  } = useLoaderData();

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
                      tone={campaign.status === "active" ? "success" : "attention"}
                    >
                      {campaign.status}
                    </Badge>

                    <Badge>{campaign.sourceType}</Badge>
                  </InlineStack>
                </BlockStack>

                <BlockStack gap="150">
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
          <ChartSection rows={chartRows} />
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