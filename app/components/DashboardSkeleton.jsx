import {
  BlockStack,
  Card,
  InlineStack,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";

function SkeletonCard() {
  return (
    <div style={{ minWidth: 170, flex: 1 }}>
      <Card>
        <BlockStack gap="300">
          <SkeletonDisplayText size="small" />
          <SkeletonBodyText lines={2} />
        </BlockStack>
      </Card>
    </div>
  );
}

export default function DashboardSkeleton() {
  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <SkeletonDisplayText size="medium" />
          <SkeletonBodyText lines={2} />

          <InlineStack gap="300" wrap>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </InlineStack>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="400">
          <SkeletonDisplayText size="small" />
          <SkeletonBodyText lines={4} />
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
