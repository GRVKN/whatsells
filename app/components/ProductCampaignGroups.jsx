import { useState } from "react";
import { Link } from "react-router";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  DataTable,
  InlineStack,
  Text,
  Thumbnail,
} from "@shopify/polaris";
import { ProductIcon } from "@shopify/polaris-icons";

import { formatMoneyFromCents } from "../money";
import ProductPickerField from "./ProductPickerField.jsx";
import styles from "../styles/product-groups.module.css";

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  return `${(Number(value) * 100).toFixed(1)}%`;
}

function productTitle(group) {
  return group.product?.title || "Unassigned campaigns";
}

function productDescription(group) {
  if (group.product) {
    return `${group.campaigns.length} campaign${
      group.campaigns.length === 1 ? "" : "s"
    } · ${group.channels.length} channel${
      group.channels.length === 1 ? "" : "s"
    }`;
  }

  return "Existing campaigns that still need a Shopify product";
}

function ProductMetric({ label, value }) {
  return (
    <div className={styles.metric}>
      <Text as="p" tone="subdued">
        {label}
      </Text>
      <Text as="p" fontWeight="semibold">
        {value}
      </Text>
    </div>
  );
}

export default function ProductCampaignGroups({
  groups,
  sourceLabelByValue,
  currency,
  hasBasicAnalytics,
  hasProFunnel,
  embeddedQuery,
  onCopyLink,
  onOpenQr,
  onDelete,
  onAssignProduct,
}) {
  const [assigningCampaignId, setAssigningCampaignId] = useState("");

  if (!groups.length) {
    return (
      <div className={styles.noResults}>
        <Text variant="headingSm" as="h3">
          No matching products or campaigns
        </Text>
        <Text as="p" tone="subdued">
          Change the search or filters to show your product groups again.
        </Text>
      </div>
    );
  }

  return (
    <BlockStack gap="400">
      {groups.map((group) => {
        const rows = group.campaigns.map((campaign) => {
          const actions = (
            <InlineStack gap="150" wrap>
              <Button size="slim" onClick={() => onCopyLink(campaign)}>
                Copy link
              </Button>

              <Link
                to={`/app/campaigns/${campaign.id}${embeddedQuery}`}
                style={{ textDecoration: "none" }}
              >
                <Button size="slim">Details</Button>
              </Link>

              <Button size="slim" onClick={() => onOpenQr(campaign)}>
                QR code
              </Button>

              <Button
                size="slim"
                onClick={() => setAssigningCampaignId(campaign.id)}
              >
                {campaign.product ? "Change product" : "Assign product"}
              </Button>

              <Button
                size="slim"
                tone="critical"
                onClick={() => onDelete(campaign.id, campaign.name)}
              >
                Delete
              </Button>
            </InlineStack>
          );

          return [
            <BlockStack gap="050" key={`${campaign.id}-name`}>
              <Text as="span" fontWeight="semibold">
                {campaign.name}
              </Text>
              <Badge
                tone={campaign.status === "active" ? "success" : "attention"}
              >
                {campaign.status}
              </Badge>
            </BlockStack>,
            sourceLabelByValue[campaign.sourceType] ||
              campaign.sourceType ||
              "—",
            campaign.clicksCount ?? 0,
            campaign.ordersCount ?? 0,
            formatMoneyFromCents(campaign.revenueCents || 0, currency),
            ...(hasProFunnel ? [campaign.addToCartCount ?? 0] : []),
            ...(hasBasicAnalytics
              ? [
                  formatMoneyFromCents(
                    campaign.profitCents ??
                      (campaign.revenueCents || 0) - (campaign.costCents || 0),
                    currency,
                  ),
                  formatPercent(campaign.roi),
                ]
              : []),
            actions,
          ];
        });

        const assigningCampaign = group.campaigns.find(
          (campaign) => campaign.id === assigningCampaignId,
        );

        return (
          <Card key={group.key}>
            <BlockStack gap="350">
              <InlineStack
                align="space-between"
                blockAlign="center"
                gap="300"
                wrap
              >
                <InlineStack blockAlign="center" gap="300" wrap={false}>
                  <Thumbnail
                    source={group.product?.imageUrl || ProductIcon}
                    alt={
                      group.product?.imageAlt ||
                      group.product?.title ||
                      "Unassigned campaigns"
                    }
                    size="medium"
                  />

                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h3">
                      {productTitle(group)}
                    </Text>

                    <Text as="p" tone="subdued">
                      {productDescription(group)}
                    </Text>

                    <InlineStack gap="100" wrap>
                      {hasBasicAnalytics && group.isTopProduct ? (
                        <Badge tone="success">Top product</Badge>
                      ) : null}

                      {hasBasicAnalytics &&
                      group.rank &&
                      !group.isTopProduct ? (
                        <Badge>
                          Product #{group.rank} of {group.assignedProductCount}
                        </Badge>
                      ) : null}

                      {group.channels.map((channel) => (
                        <Badge key={channel}>
                          {sourceLabelByValue[channel] || channel}
                        </Badge>
                      ))}
                    </InlineStack>
                  </BlockStack>
                </InlineStack>

                {group.product?.onlineStoreUrl ? (
                  <Button url={group.product.onlineStoreUrl} external>
                    Open product
                  </Button>
                ) : null}
              </InlineStack>

              <div className={styles.metricGrid}>
                <ProductMetric
                  label="Clicks"
                  value={String(group.totals.clicksCount)}
                />
                {hasProFunnel ? (
                  <ProductMetric
                    label="Add-to-Carts"
                    value={String(group.totals.addToCartCount)}
                  />
                ) : null}
                <ProductMetric
                  label="Orders"
                  value={String(group.totals.ordersCount)}
                />
                <ProductMetric
                  label="Net revenue"
                  value={formatMoneyFromCents(
                    group.totals.revenueCents,
                    currency,
                  )}
                />
                <ProductMetric
                  label="Conversion"
                  value={formatPercent(group.totals.conversionRate)}
                />
                {hasBasicAnalytics ? (
                  <>
                    <ProductMetric
                      label="Campaign result"
                      value={formatMoneyFromCents(
                        group.totals.resultCents,
                        currency,
                      )}
                    />
                    <ProductMetric
                      label="ROI"
                      value={formatPercent(group.totals.roi)}
                    />
                  </>
                ) : null}
              </div>

              <div className={styles.tableScroll}>
                <DataTable
                  columnContentTypes={[
                    "text",
                    "text",
                    "numeric",
                    "numeric",
                    "text",
                    ...(hasProFunnel ? ["numeric"] : []),
                    ...(hasBasicAnalytics ? ["text", "text"] : []),
                    "text",
                  ]}
                  headings={[
                    "Campaign",
                    "Channel",
                    "Clicks",
                    "Orders",
                    "Net revenue",
                    ...(hasProFunnel ? ["Add-to-Carts"] : []),
                    ...(hasBasicAnalytics ? ["Campaign result", "ROI"] : []),
                    "Actions",
                  ]}
                  rows={rows}
                />
              </div>

              {assigningCampaign ? (
                <div className={styles.assignment}>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" gap="200" wrap>
                      <BlockStack gap="050">
                        <Text as="p" fontWeight="semibold">
                          {assigningCampaign.product ? "Change" : "Assign"} the
                          product for “{assigningCampaign.name}”
                        </Text>
                        <Text as="p" tone="subdued">
                          Its existing clicks, orders and revenue stay
                          unchanged.
                        </Text>
                      </BlockStack>

                      <Button
                        size="slim"
                        onClick={() => setAssigningCampaignId("")}
                      >
                        Cancel
                      </Button>
                    </InlineStack>

                    <ProductPickerField
                      compact
                      selectedProduct={
                        assigningCampaign.product
                          ? {
                              id: assigningCampaign.product.shopifyProductId,
                              title: assigningCampaign.product.title,
                              handle: assigningCampaign.product.handle,
                              status: assigningCampaign.product.status,
                              imageUrl: assigningCampaign.product.imageUrl,
                              imageAlt: assigningCampaign.product.imageAlt,
                            }
                          : null
                      }
                      onSelect={async (product) => {
                        const assigned = await onAssignProduct(
                          assigningCampaign,
                          product,
                        );

                        if (assigned) {
                          setAssigningCampaignId("");
                        }
                      }}
                    />
                  </BlockStack>
                </div>
              ) : null}
            </BlockStack>
          </Card>
        );
      })}
    </BlockStack>
  );
}
