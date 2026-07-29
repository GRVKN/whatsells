export const CAMPAIGN_SOURCE_OPTIONS = Object.freeze([
  { label: "QR code", value: "qr" },
  { label: "Tracking link", value: "link" },
  { label: "Meta Ads", value: "meta" },
  { label: "Instagram", value: "instagram" },
  { label: "TikTok", value: "tiktok" },
  { label: "Google Ads", value: "google" },
  { label: "E-mail", value: "email" },
  { label: "Packaging", value: "packaging" },
  { label: "Flyer", value: "flyer" },
  { label: "Influencer", value: "influencer" },
  { label: "Event", value: "event" },
]);

export const CAMPAIGN_SOURCE_KEYS = Object.freeze(
  CAMPAIGN_SOURCE_OPTIONS.map((option) => option.value),
);

const SOURCE_LABELS = Object.freeze(
  Object.fromEntries(
    CAMPAIGN_SOURCE_OPTIONS.map((option) => [option.value, option.label]),
  ),
);

export function getCampaignSourceLabel(sourceType) {
  const key = String(sourceType || "").trim();
  return SOURCE_LABELS[key] || key || "Unknown channel";
}
