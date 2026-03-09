import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  Button,
  InlineStack,
  Modal,
  BlockStack,
  Text,
  Toast,
} from "@shopify/polaris";

async function safeCopy(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

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
  return String(value || "campaign-qr")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "campaign-qr";
}

export default function CampaignQr({
  open,
  onClose,
  value,
  title = "Campaign QR",
}) {
  const [dataUrl, setDataUrl] = useState("");
  const [toast, setToast] = useState({ active: false, content: "" });

  const fileName = useMemo(() => {
    return `${sanitizeFileName(title)}-qr.png`;
  }, [title]);

  useEffect(() => {
    let active = true;

    async function generateQr() {
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
        console.error("QR generation failed:", error);
        if (active) setDataUrl("");
      }
    }

    generateQr();

    return () => {
      active = false;
    };
  }, [open, value]);

  function downloadQr() {
    if (!dataUrl) return;

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setToast({
      active: true,
      content: "QR downloaded",
    });
  }

  async function copyLink() {
    const ok = await safeCopy(value || "");
    setToast({
      active: true,
      content: ok ? "Tracking link copied" : "Copy failed",
    });
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={title}
        primaryAction={{
          content: "Download QR",
          onAction: downloadQr,
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
            <Text as="p" tone="subdued">
              This QR code points to the campaign tracking link.
            </Text>

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
                  alt={`${title} QR`}
                  style={{
                    width: 320,
                    height: 320,
                    objectFit: "contain",
                  }}
                />
              ) : (
                <Text as="p">QR could not be generated.</Text>
              )}
            </div>

            <InlineStack gap="200">
              <Button onClick={copyLink} disabled={!value}>
                Copy link
              </Button>
            </InlineStack>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {toast.active ? (
        <Toast
          content={toast.content}
          onDismiss={() => setToast((prev) => ({ ...prev, active: false }))}
        />
      ) : null}
    </>
  );
}