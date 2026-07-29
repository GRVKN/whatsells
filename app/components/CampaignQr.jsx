import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button, InlineStack, Modal, BlockStack, Text } from "@shopify/polaris";
import { useI18n } from "../i18n-context";

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
  const { t } = useI18n();
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
    setCopyStatus(ok ? t("Tracking link copied.") : t("Could not copy link."));

    window.setTimeout(() => {
      setCopyStatus("");
    }, 2500);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(title)}
      primaryAction={{
        content: t("Download QR code"),
        onAction: downloadQrCode,
        disabled: !dataUrl,
      }}
      secondaryActions={[
        {
          content: t("Close"),
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text as="p" tone="subdued">
              {t(
                "Customers who scan this QR code will be redirected through your WhatSells tracking link.",
              )}
            </Text>

            <Text as="p" tone="subdued">
              {t(
                "Use it on flyers, packaging inserts, printed cards or offline campaigns.",
              )}
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
                alt={`${t(title)} ${t("QR code")}`}
                style={{
                  width: 320,
                  height: 320,
                  objectFit: "contain",
                }}
              />
            ) : (
              <Text as="p">{t("QR code could not be generated.")}</Text>
            )}
          </div>

          <BlockStack gap="200">
            <InlineStack gap="200">
              <Button onClick={copyTrackingLink} disabled={!value}>
                {t("Copy tracking link")}
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
