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

export default function CampaignQr({
  open,
  onClose,
  value,
  title = "Campaign QR",
}) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let active = true;

    async function generate() {
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
      } catch {
        if (active) setDataUrl("");
      }
    }

    generate();

    return () => {
      active = false;
    };
  }, [open, value]);

  function downloadQr() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${title.replace(/\s+/g, "-").toLowerCase()}-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
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
                style={{ width: 320, height: 320, objectFit: "contain" }}
              />
            ) : (
              <Text as="p">QR could not be generated.</Text>
            )}
          </div>

          <InlineStack gap="200">
            <Button
              onClick={async () => {
                await safeCopy(value);
              }}
            >
              Copy link
            </Button>
          </InlineStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}