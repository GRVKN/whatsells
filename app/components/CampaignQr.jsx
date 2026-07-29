import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button, InlineStack, Modal, BlockStack, Text } from "@shopify/polaris";

async function safeCopy(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function sanitizeFileName(value) {
  return (
    String(value || "campaign-qr")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "campaign-qr"
  );
}

export default function CampaignQr({
  open,
  onClose,
  value,
  title = "Campaign QR code",
}) {
  const [dataUrl, setDataUrl] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    let active = true;

    async function generateQrCode() {
      if (!open || !value) {
        if (active) setDataUrl("");
        return;
      }

      try {
        const url = await QRCode.toDataURL(value, {
          width: 320,
          margin: 2,
        });

        if (active) setDataUrl(url);
      } catch (error) {
        console.error("QR code generation failed:", error);
        if (active) setDataUrl("");
      }
    }

    generateQrCode();

    return () => {
      active = false;
    };
  }, [open, value]);

  function downloadQrCode() {
    if (!dataUrl) return;

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${sanitizeFileName(title)}-qr-code.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function copyTrackingLink() {
    const ok = await safeCopy(value || "");
    setCopyStatus(ok ? "Tracking link copied." : "Could not copy link.");

    window.setTimeout(() => {
      setCopyStatus("");
    }, 2500);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      primaryAction={{
        content: "Download QR code",
        onAction: downloadQrCode,
        disabled: !dataUrl,
      }}
      secondaryActions={[
        {
          content: "Close",
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text as="p" tone="subdued">
              Customers who scan this QR code will be redirected through your
              WhatSells tracking link.
            </Text>

            <Text as="p" tone="subdued">
              Use it on flyers, packaging inserts, printed cards or offline
              campaigns.
            </Text>
          </BlockStack>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: 16,
              background: "#fff",
              borderRadius: 12,
            }}
          >
            {dataUrl ? (
              <img
                src={dataUrl}
                alt={`${title} QR code`}
                style={{
                  width: 320,
                  height: 320,
                  objectFit: "contain",
                }}
              />
            ) : (
              <Text as="p">QR code could not be generated.</Text>
            )}
          </div>

          <BlockStack gap="200">
            <InlineStack gap="200">
              <Button onClick={copyTrackingLink} disabled={!value}>
                Copy tracking link
              </Button>
            </InlineStack>

            {copyStatus ? (
              <Text as="p" tone="subdued">
                {copyStatus}
              </Text>
            ) : null}
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
