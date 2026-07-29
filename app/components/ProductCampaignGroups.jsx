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

import { useI18n } from "../i18n-context";
import ProductPickerField from "./ProductPickerField.jsx";
import styles from "../styles/product-groups.module.css";

function productTitle(group, t) {
  return group.product?.title || t("Unassigned campaigns");
}

function productDescription(group, t) {
  if (group.product) {
    const campaigns = group.campaigns.length;
    const channels = group.channels.length;
    const key = `${campaigns === 1 ? "{campaigns} campaign" : "{campaigns} campaigns"} · ${
      channels === 1 ? "{channels} channel" : "{channels} channels"
    }`;

    return t(key, { campaigns, channels });
  }

  return t("Existing campaigns that still need a Shopify product");
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
  const { t, formatMoney, formatPercent } = useI18n();

  if (!groups.length) {
    return (
      <div className={styles.noResults}>
        <Text variant="headingSm" as="h3">
          {t("No matching products or campaigns")}
        </Text>
        <Text as="p" tone="subdued">
          {t("Change the search or filters to show your product groups again.")}
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
                {t("Copy link")}
              </Button>

              <Link
                to={`/app/campaigns/${campaign.id}${embeddedQuery}`}
                style={{ textDecoration: "none" }}
              >
                <Button size="slim">{t("Details")}</Button>
              </Link>

              <Button size="slim" onClick={() => onOpenQr(campaign)}>
                {t("QR code")}
              </Button>

              <Button
                size="slim"
                onClick={() => setAssigningCampaignId(campaign.id)}
              >
                {campaign.product ? t("Change product") : t("Assign product")}
              </Button>

              <Button
                size="slim"
                tone="critical"
                onClick={() => onDelete(campaign.id, campaign.name)}
              >
                {t("Delete")}
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
                {t(
                  String(campaign.status).charAt(0).toUpperCase() +
                    String(campaign.status).slice(1),
                )}
              </Badge>
            </BlockStack>,
            sourceLabelByValue[campaign.sourceType] ||
              campaign.sourceType ||
              "—",
            campaign.clicksCount ?? 0,
            campaign.ordersCount ?? 0,
            formatMoney(campaign.revenueCents || 0, currency),
            ...(hasProFunnel ? [campaign.addToCartCount ?? 0] : []),
            ...(hasBasicAnalytics
              ? [
                  formatMoney(
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
                      t("Unassigned campaigns")
                    }
                    size="medium"
                  />

                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h3">
                      {productTitle(group, t)}
                    </Text>

                    <Text as="p" tone="subdued">
                      {productDescription(group, t)}
                    </Text>

                    <InlineStack gap="100" wrap>
                      {hasBasicAnalytics && group.isTopProduct ? (
                        <Badge tone="success">{t("Top product")}</Badge>
                      ) : null}

                      {hasBasicAnalytics &&
                      group.rank &&
                      !group.isTopProduct ? (
                        <Badge>
                          {t("Product #{rank} of {count}", {
                            rank: group.rank,
                            count: group.assignedProductCount,
                          })}
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
                    {t("Open product")}
                  </Button>
                ) : null}
              </InlineStack>

              <div className={styles.metricGrid}>
                <ProductMetric
                  label={t("Clicks")}
                  value={String(group.totals.clicksCount)}
                />
                {hasProFunnel ? (
                  <ProductMetric
                    label={t("Add-to-Carts")}
                    value={String(group.totals.addToCartCount)}
                  />
                ) : null}
                <ProductMetric
                  label={t("Orders")}
                  value={String(group.totals.ordersCount)}
                />
                <ProductMetric
                  label={t("Net revenue")}
                  value={formatMoney(group.totals.revenueCents, currency)}
                />
                <ProductMetric
                  label={t("Conversion")}
                  value={formatPercent(group.totals.conversionRate)}
                />
                {hasBasicAnalytics ? (
                  <>
                    <ProductMetric
                      label={t("Campaign result")}
                      value={formatMoney(group.totals.resultCents, currency)}
                    />
                    <ProductMetric
                      label={t("ROI")}
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
                    t("Campaign"),
                    t("Channel"),
                    t("Clicks"),
                    t("Orders"),
                    t("Net revenue"),
                    ...(hasProFunnel ? [t("Add-to-Carts")] : []),
                    ...(hasBasicAnalytics
                      ? [t("Campaign result"), t("ROI")]
                      : []),
                    t("Actions"),
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
                          {t(
                            assigningCampaign.product
                              ? "Change the product for “{campaign}”"
                              : "Assign the product for “{campaign}”",
                            { campaign: assigningCampaign.name },
                          )}
                        </Text>
                        <Text as="p" tone="subdued">
                          {t(
                            "Its existing clicks, orders and revenue stay unchanged.",
                          )}
                        </Text>
                      </BlockStack>

                      <Button
                        size="slim"
                        onClick={() => setAssigningCampaignId("")}
                      >
                        {t("Cancel")}
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
