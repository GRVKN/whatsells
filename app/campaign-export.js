function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function csvCell(value) {
  const text = String(value ?? "");
  const isNumeric = /^-?\d+(?:\.\d+)?$/.test(text);
  const safeText = !isNumeric && /^[=+\-@]/.test(text) ? `'${text}` : text;

  if (!/[",\r\n]/.test(safeText)) {
    return safeText;
  }

  return `"${safeText.replaceAll('"', '""')}"`;
}

function formatDecimal(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "";
  }

  return Number(value).toFixed(2);
}

function formatPercent(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "";
  }

  return (Number(value) * 100).toFixed(2);
}

export function buildCampaignExportCsv(
  campaigns,
  { currency = "EUR", trackBaseUrl = "" } = {},
) {
  const headers = [
    "Product",
    "Shopify product ID",
    "Campaign",
    "Type",
    "Status",
    "Destination URL",
    "Created",
    "Clicks",
    "Orders",
    "Cancelled orders",
    `Net revenue (${currency})`,
    `Refunded (${currency})`,
    `Campaign cost (${currency})`,
    `Campaign result (${currency})`,
    "ROI (%)",
    "ROAS",
    "Conversion (%)",
    "Tracking link",
    "Notes",
  ];

  const normalizedBaseUrl = String(trackBaseUrl || "").replace(/\/$/, "");
  const rows = (Array.isArray(campaigns) ? campaigns : []).map((campaign) => {
    const costCents = numberOrZero(campaign.costCents);
    const revenueCents = numberOrZero(campaign.revenueCents);
    const clicks = numberOrZero(campaign.clicksCount);
    const orders = numberOrZero(campaign.ordersCount);
    const campaignResultCents = revenueCents - costCents;
    const roi = costCents > 0 ? campaignResultCents / costCents : null;
    const roas = costCents > 0 ? revenueCents / costCents : null;
    const conversion = clicks > 0 ? orders / clicks : null;
    const trackingLink =
      normalizedBaseUrl && campaign.publicToken
        ? `${normalizedBaseUrl}/go/${campaign.publicToken}`
        : "";

    return [
      campaign.product?.title || "Unassigned",
      campaign.product?.shopifyProductId || "",
      campaign.name,
      campaign.sourceType,
      campaign.status,
      campaign.targetUrl,
      campaign.createdAt instanceof Date
        ? campaign.createdAt.toISOString()
        : campaign.createdAt,
      clicks,
      orders,
      numberOrZero(campaign.cancelledOrdersCount),
      formatDecimal(revenueCents / 100),
      formatDecimal(numberOrZero(campaign.refundedCents) / 100),
      formatDecimal(costCents / 100),
      formatDecimal(campaignResultCents / 100),
      formatPercent(roi),
      formatDecimal(roas),
      formatPercent(conversion),
      trackingLink,
      campaign.notes,
    ];
  });

  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
