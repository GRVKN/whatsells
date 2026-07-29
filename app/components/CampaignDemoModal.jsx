import {
  Badge,
  BlockStack,
  Box,
  Divider,
  InlineStack,
  Modal,
  Text,
} from "@shopify/polaris";
import { useI18n } from "../i18n-context";

function DemoStep({ number, title, children }) {
  return (
    <Box background="bg-surface-secondary" borderRadius="300" padding="400">
      <BlockStack gap="200">
        <InlineStack gap="200" blockAlign="center">
          <Badge tone="info">{number}</Badge>

          <Text variant="headingSm" as="h3">
            {title}
          </Text>
        </InlineStack>

        {children}
      </BlockStack>
    </Box>
  );
}

export default function CampaignDemoModal({ open, onClose, onStart }) {
  const { t } = useI18n();
  function startOwnCampaign() {
    onClose();
    onStart();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("Example campaign")}
      primaryAction={{
        content: t("Create my own campaign"),
        onAction: startOwnCampaign,
      }}
      secondaryActions={[
        {
          content: t("Close"),
          onAction: onClose,
        },
      ]}
      large
    >
      <Modal.Section>
        <BlockStack gap="400">
          <InlineStack align="space-between" gap="200" wrap>
            <BlockStack gap="100">
              <Text variant="headingMd" as="h2">
                {t("Spring flyer · garden collection")}
              </Text>

              <Text as="p" tone="subdued">
                {t("A complete example from destination to measurable result.")}
              </Text>
            </BlockStack>

            <Badge tone="attention">{t("Demo data only")}</Badge>
          </InlineStack>

          <DemoStep number="1" title={t("Campaign setup")}>
            <Text as="p">
              {t("Channel: Flyer · Product: Garden chair · Cost: €120")}
            </Text>
            <Text as="p" tone="subdued">
              {t(
                "WhatSells creates one unique tracking link and a downloadable QR code for the printed flyer.",
              )}
            </Text>
          </DemoStep>

          <DemoStep number="2" title={t("Distribution")}>
            <Text as="p">
              {t(
                "The QR code is printed on 500 flyers. Every scan passes through the campaign link before the visitor reaches the collection.",
              )}
            </Text>
          </DemoStep>

          <DemoStep number="3" title={t("Measured result")}>
            <InlineStack gap="500" wrap>
              <BlockStack gap="050">
                <Text as="p" tone="subdued">
                  {t("Clicks")}
                </Text>
                <Text variant="headingLg" as="p">
                  184
                </Text>
              </BlockStack>

              <BlockStack gap="050">
                <Text as="p" tone="subdued">
                  {t("Orders")}
                </Text>
                <Text variant="headingLg" as="p">
                  11
                </Text>
              </BlockStack>

              <BlockStack gap="050">
                <Text as="p" tone="subdued">
                  {t("Net revenue")}
                </Text>
                <Text variant="headingLg" as="p">
                  €642
                </Text>
              </BlockStack>

              <BlockStack gap="050">
                <Text as="p" tone="subdued">
                  {t("Campaign result")}
                </Text>
                <Text variant="headingLg" as="p">
                  €522
                </Text>
              </BlockStack>
            </InlineStack>

            <Divider />

            <Text as="p" tone="subdued">
              {t(
                "Campaign result is net attributed revenue minus the €120 campaign cost. Product and operating costs are not included.",
              )}
            </Text>
          </DemoStep>

          <Text as="p" tone="subdued">
            {t(
              "This preview is never saved, never counted against a plan limit and never appears in your analytics.",
            )}
          </Text>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
