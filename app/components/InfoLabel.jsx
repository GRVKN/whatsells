import { useState } from "react";
import { BlockStack, Box, InlineStack, Popover, Text } from "@shopify/polaris";

import { METRIC_INFO } from "../metric-info";
import { useI18n } from "../i18n-context";

export default function InfoLabel({ label, infoKey }) {
  const [active, setActive] = useState(false);
  const { t } = useI18n();
  const info = METRIC_INFO[infoKey];

  if (!info) return label;

  const activator = (
    <button
      type="button"
      aria-label={t("Explain {label}", { label })}
      aria-expanded={active}
      onClick={() => setActive((value) => !value)}
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        border: "1px solid #8c9196",
        background: "#ffffff",
        color: "#4a4a4a",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 700,
        lineHeight: "16px",
        padding: 0,
      }}
    >
      i
    </button>
  );

  return (
    <InlineStack gap="100" blockAlign="center" wrap={false}>
      <span>{label}</span>

      <Popover
        active={active}
        activator={activator}
        autofocusTarget="none"
        onClose={() => setActive(false)}
      >
        <Box padding="300" maxWidth="360px">
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3">
              {t(info.title)}
            </Text>

            <Text as="p">{t(info.description)}</Text>

            {info.formula ? (
              <BlockStack gap="050">
                <Text as="p" fontWeight="semibold">
                  {t("Formula")}
                </Text>
                <Text as="p">{t(info.formula)}</Text>
              </BlockStack>
            ) : null}

            {info.example ? (
              <BlockStack gap="050">
                <Text as="p" fontWeight="semibold">
                  {t("Example")}
                </Text>
                <Text as="p">{t(info.example)}</Text>
              </BlockStack>
            ) : null}

            {info.note ? (
              <Text as="p" tone="subdued">
                {t(info.note)}
              </Text>
            ) : null}
          </BlockStack>
        </Box>
      </Popover>
    </InlineStack>
  );
}
