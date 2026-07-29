import { useEffect, useState } from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  InlineStack,
  Modal,
  ProgressBar,
  Text,
} from "@shopify/polaris";

const STEPS = [
  {
    eyebrow: "Step 1 of 3",
    title: "Choose what you want to measure",
    description:
      "Choose the exact product from Shopify, name the campaign and select where its tracking link or QR code will be used.",
    detail:
      "Campaign cost and notes are optional. Adding the cost lets WhatSells calculate campaign result, ROI and ROAS.",
  },
  {
    eyebrow: "Step 2 of 3",
    title: "Share one unique tracking asset",
    description:
      "WhatSells creates a tracking link and QR code that belong only to this campaign. Use that link in the ad, creator post, flyer or packaging.",
    detail:
      "Do not replace it with the normal product link. The short detour through WhatSells is what makes attribution possible.",
  },
  {
    eyebrow: "Step 3 of 3",
    title: "Read the result, not just the traffic",
    description:
      "Clicks appear first. Attributed orders, net revenue, refunds and cancellations follow through Shopify.",
    detail:
      "Open campaign details for the timeline and order trail. Pro also shows the click → add-to-cart → order funnel.",
  },
];

export default function OnboardingModal({
  open,
  hasCampaigns,
  onClose,
  onStart,
  onViewDemo,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  function finishGuide() {
    onClose();
    onStart();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Welcome to WhatSells"
      primaryAction={{
        content: isLastStep
          ? hasCampaigns
            ? "View my campaigns"
            : "Create first campaign"
          : "Next",
        onAction: isLastStep
          ? finishGuide
          : () => setStepIndex((value) => value + 1),
      }}
      secondaryActions={[
        ...(stepIndex > 0
          ? [
              {
                content: "Back",
                onAction: () => setStepIndex((value) => value - 1),
              },
            ]
          : []),
        {
          content: "Skip for now",
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="500">
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center" gap="200">
              <Badge tone="info">{step.eyebrow}</Badge>

              <Text as="p" tone="subdued">
                About one minute
              </Text>
            </InlineStack>

            <ProgressBar
              progress={Math.round(((stepIndex + 1) / STEPS.length) * 100)}
              size="small"
            />
          </BlockStack>

          <Box
            background="bg-surface-secondary"
            borderRadius="300"
            padding="500"
          >
            <BlockStack gap="300">
              <Text variant="headingLg" as="h2">
                {step.title}
              </Text>

              <Text as="p">{step.description}</Text>

              <Text as="p" tone="subdued">
                {step.detail}
              </Text>
            </BlockStack>
          </Box>

          <InlineStack align="space-between" blockAlign="center" gap="200" wrap>
            <Text as="p" tone="subdued">
              The example uses demo values and never changes your shop data.
            </Text>

            <Button variant="plain" onClick={onViewDemo}>
              View example campaign
            </Button>
          </InlineStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
