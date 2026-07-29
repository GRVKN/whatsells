import {
  Badge,
  BlockStack,
  Button,
  Card,
  InlineStack,
  ProgressBar,
  Text,
} from "@shopify/polaris";

function getNextAction(checklist) {
  return checklist.find((item) => !item.complete)?.id || "complete";
}

function getNextActionLabel(nextAction) {
  if (nextAction === "create") return "Create first campaign";
  if (nextAction === "share") return "Copy first tracking link";
  if (nextAction === "click") return "Refresh tracking data";
  if (nextAction === "order") return "View campaign details";

  return "View campaigns";
}

export default function GettingStartedCard({
  checklist,
  progress,
  onNextAction,
  onOpenGuide,
  onViewDemo,
}) {
  const nextAction = getNextAction(checklist);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" gap="300" wrap>
          <BlockStack gap="100">
            <InlineStack gap="200" blockAlign="center" wrap>
              <Text variant="headingMd" as="h2">
                Getting started
              </Text>

              <Badge tone={progress === 100 ? "success" : "info"}>
                {progress}% complete
              </Badge>
            </InlineStack>

            <Text as="p" tone="subdued">
              Follow the real tracking journey from campaign to attributed
              order.
            </Text>
          </BlockStack>

          <InlineStack gap="200" wrap>
            <Button onClick={onViewDemo}>View example</Button>
            <Button onClick={onOpenGuide}>Open guide</Button>
          </InlineStack>
        </InlineStack>

        <ProgressBar progress={progress} size="small" />

        <BlockStack gap="250">
          {checklist.map((item, index) => (
            <InlineStack
              key={item.id}
              align="space-between"
              blockAlign="start"
              gap="300"
              wrap={false}
            >
              <InlineStack gap="200" blockAlign="start" wrap={false}>
                <Badge tone={item.complete ? "success" : undefined}>
                  {item.complete ? "Done" : String(index + 1)}
                </Badge>

                <BlockStack gap="050">
                  <Text
                    as="p"
                    fontWeight={item.complete ? "regular" : "semibold"}
                    tone={item.complete ? "subdued" : undefined}
                  >
                    {item.label}
                  </Text>

                  <Text as="p" tone="subdued">
                    {item.description}
                  </Text>
                </BlockStack>
              </InlineStack>
            </InlineStack>
          ))}
        </BlockStack>

        <InlineStack align="end">
          <Button variant="primary" onClick={() => onNextAction(nextAction)}>
            {getNextActionLabel(nextAction)}
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
