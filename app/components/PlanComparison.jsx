import {
  Badge,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Text,
} from "@shopify/polaris";

import { PLAN_DEFINITIONS, PLAN_KEYS, normalizePlanKey } from "../plans";
import styles from "../styles/plan-comparison.module.css";

const PRICE_LABELS = {
  [PLAN_KEYS.FREE]: "€0",
  [PLAN_KEYS.BASIC]: "€9 / month",
  [PLAN_KEYS.PRO]: "€19 / month",
  [PLAN_KEYS.EXPERT]: "€99 / month",
};

const PLAN_ORDER = [
  PLAN_KEYS.FREE,
  PLAN_KEYS.BASIC,
  PLAN_KEYS.PRO,
  PLAN_KEYS.EXPERT,
];

function openTop(url) {
  if (url) {
    window.open(url, "_top");
  }
}

function getPlanAction({ planKey, currentPlanKey, urls }) {
  if (planKey === currentPlanKey) {
    return urls.upgradeUrl
      ? {
          label: "Manage plan",
          url: urls.upgradeUrl,
          variant: "secondary",
        }
      : null;
  }

  const currentIndex = PLAN_ORDER.indexOf(currentPlanKey);
  const targetIndex = PLAN_ORDER.indexOf(planKey);
  const planUrl = {
    [PLAN_KEYS.BASIC]: urls.basicUrl,
    [PLAN_KEYS.PRO]: urls.proUrl,
    [PLAN_KEYS.EXPERT]: urls.expertUrl,
  }[planKey];

  if (targetIndex > currentIndex) {
    return {
      label: `Choose ${PLAN_DEFINITIONS[planKey]?.label || "plan"}`,
      url: planUrl || urls.upgradeUrl,
      variant: targetIndex === currentIndex + 1 ? "primary" : "secondary",
    };
  }

  return null;
}

export default function PlanComparison({
  capabilities,
  upgradeUrl,
  basicUrl,
  proUrl,
  expertUrl,
}) {
  const currentPlanKey = normalizePlanKey(
    capabilities?.planKey || capabilities?.plan,
  );
  const urls = { upgradeUrl, basicUrl, proUrl, expertUrl };

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text variant="headingMd" as="h2">
            Choose the level of detail you need
          </Text>

          <Text as="p" tone="subdued">
            Every plan tracks real orders. Paid plans add deeper analysis, and
            Expert adds a protected AI copilot, live market scans, campaign
            packages and flyer generation.
          </Text>
        </BlockStack>

        <div className={styles.planGrid}>
          {Object.values(PLAN_DEFINITIONS).map((definition) => {
            const isCurrent = definition.key === currentPlanKey;
            const action = getPlanAction({
              planKey: definition.key,
              currentPlanKey,
              urls,
            });

            return (
              <div
                className={`${styles.planCard} ${
                  isCurrent ? styles.currentPlan : ""
                }`}
                key={definition.key}
              >
                <BlockStack gap="300">
                  <InlineStack align="space-between" gap="200" wrap>
                    <BlockStack gap="050">
                      <Text variant="headingMd" as="h3">
                        {definition.label}
                      </Text>

                      <Text as="p" fontWeight="semibold">
                        {PRICE_LABELS[definition.key]}
                      </Text>
                    </BlockStack>

                    {isCurrent ? (
                      <Badge tone="success">Current plan</Badge>
                    ) : null}
                  </InlineStack>

                  <Text as="p" tone="subdued">
                    {definition.summary}
                  </Text>

                  <ul className={styles.featureList}>
                    {definition.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>

                  {action?.url ? (
                    <Button
                      variant={action.variant}
                      onClick={() => openTop(action.url)}
                    >
                      {action.label}
                    </Button>
                  ) : null}
                </BlockStack>
              </div>
            );
          })}
        </div>

        <Text as="p" tone="subdued">
          Billing changes are confirmed in Shopify before they become active.
          Downgrading never deletes existing campaign data, but features and new
          campaign creation follow the active plan limits.
        </Text>
      </BlockStack>
    </Card>
  );
}
