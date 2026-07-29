-- Read-only checks to run after the existing attribution duplicate preflight
-- and before `prisma migrate deploy`.

SELECT
  "id",
  "shop",
  "name",
  "costCents",
  "clicksCount",
  "addToCartCount",
  "revenueCents",
  "ordersCount",
  "refundedCents",
  "cancelledOrdersCount"
FROM "Campaign"
WHERE "costCents" < 0
   OR "clicksCount" < 0
   OR "addToCartCount" < 0
   OR "revenueCents" < 0
   OR "ordersCount" < 0
   OR "refundedCents" < 0
   OR "cancelledOrdersCount" < 0;

SELECT
  "id",
  "campaignId",
  "orderId",
  "originalValueCents",
  "valueCents",
  "refundedCents"
FROM "Event"
WHERE ("originalValueCents" IS NOT NULL AND "originalValueCents" < 0)
   OR ("valueCents" IS NOT NULL AND "valueCents" < 0)
   OR "refundedCents" < 0;

SELECT "shop", "plan"
FROM "ShopPlanState"
WHERE "plan" NOT IN ('free', 'basic', 'pro', 'expert');

SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'record_click_event',
    'record_add_to_cart_event',
    'record_purchase_event',
    'resync_campaign_stats',
    'apply_campaign_event_aggregates'
  )
ORDER BY p.proname;
