import { getShopPlan } from "../billing.server";
import { buildCampaignExportCsv } from "../campaign-export";
import db from "../db.server";
import { getPlanCapabilities } from "../plans";
import { getShopCurrency } from "../shop-currency.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const [plan, currency] = await Promise.all([
    getShopPlan({ shop, admin }),
    getShopCurrency(admin),
  ]);
  const capabilities = getPlanCapabilities(plan);

  if (!capabilities.canExportCampaigns) {
    return Response.json(
      {
        error: "CSV campaign export is available from the Basic plan.",
        upgradeRequired: true,
        requiredPlan: "Basic",
        basicUrl: plan.basicUrl,
        proUrl: plan.proUrl,
        upgradeUrl: plan.upgradeUrl,
      },
      { status: 403 },
    );
  }

  const campaigns = await db.campaign.findMany({
    where: {
      shop,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      product: {
        select: {
          shopifyProductId: true,
          title: true,
          handle: true,
          onlineStoreUrl: true,
        },
      },
    },
  });

  const trackBaseUrl =
    process.env.TRACK_BASE_URL ||
    process.env.SHOPIFY_APP_URL ||
    "https://app.whatsells.dev";
  const csv = buildCampaignExportCsv(campaigns, {
    currency,
    trackBaseUrl,
  });
  const date = new Date().toISOString().slice(0, 10);

  return new Response(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="whatsells-campaigns-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
