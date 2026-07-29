import { useCallback, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { ProductIcon } from "@shopify/polaris-icons";
import {
  BlockStack,
  Button,
  InlineStack,
  Text,
  Thumbnail,
} from "@shopify/polaris";

function firstPickerImage(product) {
  const image = Array.isArray(product?.images) ? product.images[0] : null;

  return {
    url: image?.originalSrc || "",
    alt: image?.altText || product?.title || "Shopify product",
  };
}

export default function ProductPickerField({
  selectedProduct,
  onSelect,
  disabled = false,
  error = "",
  compact = false,
}) {
  const shopify = useAppBridge();
  const [opening, setOpening] = useState(false);
  const [pickerError, setPickerError] = useState("");

  const openPicker = useCallback(async () => {
    setPickerError("");
    setOpening(true);

    try {
      const selection = await shopify.resourcePicker({
        type: "product",
        action: "select",
        multiple: false,
        filter: {
          hidden: false,
          variants: false,
          draft: false,
          archived: false,
        },
        ...(selectedProduct?.id
          ? {
              selectionIds: [{ id: selectedProduct.id }],
            }
          : {}),
      });

      const product = Array.isArray(selection) ? selection[0] : null;

      if (!product?.id) return;

      const image = firstPickerImage(product);

      await onSelect({
        id: product.id,
        title: product.title || "Untitled product",
        handle: product.handle || "",
        status: product.status || "",
        imageUrl: image.url,
        imageAlt: image.alt,
      });
    } catch (pickerFailure) {
      console.error("Shopify product picker failed", pickerFailure);
      setPickerError(
        "The Shopify product selector could not be opened. Refresh the app and try again.",
      );
    } finally {
      setOpening(false);
    }
  }, [onSelect, selectedProduct?.id, shopify]);

  return (
    <BlockStack gap="150">
      {selectedProduct ? (
        <div
          style={{
            border: "1px solid #c9cccf",
            borderRadius: "0.75rem",
            padding: compact ? "0.65rem" : "0.9rem",
          }}
        >
          <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
            <InlineStack blockAlign="center" gap="250" wrap={false}>
              <Thumbnail
                source={selectedProduct.imageUrl || ProductIcon}
                alt={selectedProduct.imageAlt || selectedProduct.title}
                size={compact ? "small" : "medium"}
              />

              <BlockStack gap="050">
                <Text as="p" fontWeight="semibold">
                  {selectedProduct.title}
                </Text>

                <Text as="p" tone="subdued">
                  Shopify product
                  {selectedProduct.status
                    ? ` · ${String(selectedProduct.status).toLowerCase()}`
                    : ""}
                </Text>
              </BlockStack>
            </InlineStack>

            <Button
              onClick={openPicker}
              loading={opening}
              disabled={disabled}
              size={compact ? "slim" : "medium"}
            >
              Change product
            </Button>
          </InlineStack>
        </div>
      ) : (
        <Button
          onClick={openPicker}
          loading={opening}
          disabled={disabled}
          fullWidth
        >
          Choose Shopify product
        </Button>
      )}

      {error || pickerError ? (
        <Text as="p" tone="critical">
          {error || pickerError}
        </Text>
      ) : (
        <Text as="p" tone="subdued">
          Select the exact product from your Shopify catalog. WhatSells creates
          the destination automatically.
        </Text>
      )}
    </BlockStack>
  );
}
