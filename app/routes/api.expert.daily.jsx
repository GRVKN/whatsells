import db from "../db.server";
import { getShopPlan } from "../billing.server";
import { purgeExpiredExpertAssets } from "../expert-assets.server";
import { getOrCreateExpertSnapshot } from "../expert-analysis.server";
import { generateWeeklyExpertStrategy } from "../expert-copilot.server";
import { isValidExpertCronRequest } from "../expert-cron.server";
import { getPlanCapabilities } from "../plans";
import { getShopCurrency } from "../shop-currency.server";
import { unauthenticated } from "../shopify.server";

export async function action({ request }) {
  if (!isValidExpertCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidates = await db.shopPlanState.findMany({
    where: {
      plan: "expert",
    },
    orderBy: {
      lastSuccessfulCheckAt: "asc",
    },
    select: {
      shop: true,
    },
    take: 100,
  });

  let generated = 0;
  let current = 0;
  let skipped = 0;
  let failed = 0;
  let weeklyGenerated = 0;
  let weeklySkipped = 0;

  for (const candidate of candidates) {
    try {
      const { admin } = await unauthenticated.admin(candidate.shop);
      const plan = await getShopPlan({
        shop: candidate.shop,
        admin,
        requireLive: true,
      });
      const capabilities = getPlanCapabilities(plan);

      if (!capabilities.canUseExpertOperator) {
        skipped += 1;
        continue;
      }

      const currency = await getShopCurrency(admin);
      const before = await db.expertSnapshot.findFirst({
        where: {
          shop: candidate.shop,
        },
        orderBy: {
          snapshotDate: "desc",
        },
        select: {
          id: true,
          snapshotDate: true,
        },
      });
      const snapshot = await getOrCreateExpertSnapshot({
        shop: candidate.shop,
        currency,
      });

      if (before?.id === snapshot.id) {
        current += 1;
      } else {
        generated += 1;
      }

      if (
        process.env.EXPERT_AI_ENABLED === "true" &&
        process.env.OPENAI_API_KEY
      ) {
        const weekly = await generateWeeklyExpertStrategy({
          shop: candidate.shop,
          snapshot,
        });
        if (!weekly.reused) {
          weeklyGenerated += 1;
        }
      } else {
        weeklySkipped += 1;
      }
    } catch (error) {
      failed += 1;
      console.error("Daily Expert snapshot failed", {
        shop: candidate.shop,
        error: error?.message || String(error),
      });
    }
  }

  let expiredAssetsPurged = 0;
  try {
    expiredAssetsPurged = await purgeExpiredExpertAssets({});
  } catch (error) {
    failed += 1;
    console.error("Expired Expert asset purge failed", {
      error: error?.message || String(error),
    });
  }

  return Response.json({
    ok: failed === 0,
    checked: candidates.length,
    generated,
    current,
    skipped,
    failed,
    weeklyGenerated,
    weeklySkipped,
    expiredAssetsPurged,
  });
}
