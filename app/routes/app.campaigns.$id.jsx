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
  process.env.TRACK_BASE_URL || "https://go.whatsells.dev";

export const headers = (headersArgs) => {
  return addDocumentResponseHeaders(headersArgs);
};

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

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function calcProfit(costCents, revenueCents) {
  return Number(revenueCents || 0) - Number(costCents || 0);
}

function calcRoas(costCents, revenueCents) {
  if (!costCents || costCents <= 0) return null;
  return Number(revenueCents || 0) / Number(costCents || 0);
}

function calcRoi(costCents, revenueCents) {
  if (!costCents || costCents <= 0) return null;
  const profitCents = calcProfit(costCents, revenueCents);
  return profitCents / Number(costCents || 0);
}

function calcConversionRate(clicks, orders) {
  if (!clicks || clicks <= 0) return 0;
  return Number(orders || 0) / Number(clicks || 0);
}

function calcAverageOrderValue(revenueCents, orders) {
  if (!orders || orders <= 0) return null;
  return Math.round(Number(revenueCents || 0) / Number(orders || 0));
}

function calcBreakEvenOrders(costCents, avgOrderValueCents) {
  if (!costCents || costCents <= 0) return 0;
  if (!avgOrderValueCents || avgOrderValueCents <= 0) return null;
  return Math.ceil(Number(costCents) / Number(avgOrderValueCents));
}

export async function loader({ request, params }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const id = String(params.id || "").trim();

  if (!id) {
    throw new Response("Missing campaign id", { status: 400 });
  }

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

  const [clicks7d, clicks30d, recentEvents] = await Promise.all([
    db.event.count({
      where: {
        campaignId: campaign.id,
        type: "click",
        createdAt: { gte: daysAgo(7) },
      },
    }),
    db.event.count({
      where: {
        campaignId: campaign.id,
        type: "click",
        createdAt: { gte: daysAgo(30) },
      },
    }),
    db.event.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: "desc" },
      take: 20,
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

  return {
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
    },
    recentEvents,
  };
}

export default function CampaignDetails() {
  const { campaign, recentEvents } = useLoaderData();

  const eventRows = recentEvents.map((event) => [
    formatDateTime(event.createdAt),
    event.type,
    event.referer || "—",
    event.lang || "—",
    event.orderId || "—",
    event.valueCents != null ? formatMoneyFromCents(event.valueCents) : "—",
  ]);

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
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h2">
                    {campaign.name}
                  </Text>

                  <InlineStack gap="200">
                    <Badge
                      tone={campaign.status === "active" ? "success" : "attention"}
                    >
                      {campaign.status}
                    </Badge>
                    <Text as="span" tone="subdued">
                      Source: {campaign.sourceType}
                    </Text>
                  </InlineStack>
                </BlockStack>

                <Button url={campaign.goUrl} external>
                  Open live link
                </Button>
              </InlineStack>

              <DataTable
                columnContentTypes={["text", "text"]}
                headings={["Metric", "Value"]}
                rows={[
                  ["Clicks 7d", String(campaign.clicks7d ?? 0)],
                  ["Clicks 30d", String(campaign.clicks30d ?? 0)],
                  ["Clicks total", String(campaign.clicksCount ?? 0)],
                  ["Orders", String(campaign.ordersCount ?? 0)],
                  ["Conversion", formatPercent(campaign.conversionRate)],
                  ["Revenue", formatMoneyFromCents(campaign.revenueCents || 0)],
                  ["Cost", formatMoneyFromCents(campaign.costCents || 0)],
                  ["Profit", formatMoneyFromCents(campaign.profitCents || 0)],
                  ["ROI", formatPercent(campaign.roi)],
                  ["ROAS", formatRatio(campaign.roas)],
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