export const ONBOARDING_STORAGE_KEY = "whatsells:onboarding:v1";
export const PREPARED_ASSET_STORAGE_KEY = "whatsells:prepared-asset:v1";

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildSetupChecklist({
  campaignCount,
  hasPreparedAsset,
  clicks,
  orders,
}) {
  const hasCampaign = safeNumber(campaignCount) > 0;
  const hasClicks = safeNumber(clicks) > 0;
  const hasOrders = safeNumber(orders) > 0;

  return [
    {
      id: "create",
      label: "Create your first campaign",
      description:
        "Choose a Shopify product and give the campaign a clear channel name.",
      complete: hasCampaign,
    },
    {
      id: "share",
      label: "Prepare the tracking link or QR code",
      description: "Use the unique asset generated for that campaign.",
      complete: hasCampaign && Boolean(hasPreparedAsset),
    },
    {
      id: "click",
      label: "Receive the first tracked click",
      description: "A click appears after someone uses the campaign asset.",
      complete: hasCampaign && hasClicks,
    },
    {
      id: "order",
      label: "Attribute the first order",
      description: "Orders appear after checkout through the tracking journey.",
      complete: hasCampaign && hasOrders,
    },
  ];
}

export function calculateSetupProgress(checklist) {
  if (!Array.isArray(checklist) || checklist.length === 0) return 0;

  const completeCount = checklist.filter((item) => item.complete).length;
  return Math.round((completeCount / checklist.length) * 100);
}
