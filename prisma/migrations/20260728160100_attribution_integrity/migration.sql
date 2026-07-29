BEGIN;

-- Stop before changing production data if historical duplicate purchases need
-- a manual decision. The migration can then be rerun after those rows are
-- reviewed instead of silently deleting revenue.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Event"
    WHERE "type" = 'purchase'
      AND "orderId" IS NOT NULL
    GROUP BY "orderId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate purchase orderId values found. Review and deduplicate them before deploying this migration.';
  END IF;
END
$$;

UPDATE "Campaign"
SET "addToCartCount" = 0
WHERE "addToCartCount" IS NULL;

ALTER TABLE "Campaign"
ALTER COLUMN "addToCartCount" SET DEFAULT 0,
ALTER COLUMN "addToCartCount" SET NOT NULL;

ALTER TABLE "Event"
ALTER COLUMN "campaignId" SET NOT NULL,
ALTER COLUMN "type" SET NOT NULL;

ALTER TABLE "Campaign"
ALTER COLUMN "shop" SET NOT NULL,
ALTER COLUMN "publicToken" SET NOT NULL,
ALTER COLUMN "name" SET NOT NULL;

ALTER TABLE "Event"
DROP CONSTRAINT IF EXISTS "Event_campaignId_fkey";

ALTER TABLE "Event"
ADD CONSTRAINT "Event_campaignId_fkey"
FOREIGN KEY ("campaignId")
REFERENCES "Campaign"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- One Shopify order can only create one attributed purchase, even when Shopify
-- retries the webhook or two deliveries arrive at the same time.
CREATE UNIQUE INDEX IF NOT EXISTS "Event_purchase_orderId_key"
ON "Event"("orderId")
WHERE "type" = 'purchase' AND "orderId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Event_campaignId_type_createdAt_idx"
ON "Event"("campaignId", "type", "createdAt");

CREATE INDEX IF NOT EXISTS "Event_orderId_idx"
ON "Event"("orderId");

CREATE INDEX IF NOT EXISTS "Session_shop_idx"
ON "Session"("shop");

CREATE INDEX IF NOT EXISTS "Session_expires_idx"
ON "Session"("expires");

CREATE INDEX IF NOT EXISTS "Session_shop_isOnline_idx"
ON "Session"("shop", "isOnline");

CREATE INDEX IF NOT EXISTS "Session_shop_expires_idx"
ON "Session"("shop", "expires");

-- The backend owns all counters. Remove an earlier database trigger if it is
-- present, otherwise every event would be counted twice.
DROP TRIGGER IF EXISTS trg_apply_campaign_event_aggregates ON "Event";
DROP FUNCTION IF EXISTS public.apply_campaign_event_aggregates();

-- Rebuild cached counters from the source-of-truth events.
UPDATE "Campaign"
SET
  "clicksCount" = 0,
  "addToCartCount" = 0,
  "ordersCount" = 0,
  "revenueCents" = 0;

WITH stats AS (
  SELECT
    "campaignId",
    COUNT(*) FILTER (WHERE "type" = 'click')::INTEGER AS clicks,
    COUNT(*) FILTER (WHERE "type" = 'add_to_cart')::INTEGER AS add_to_carts,
    COUNT(*) FILTER (WHERE "type" = 'purchase')::INTEGER AS purchases,
    COALESCE(
      SUM("valueCents") FILTER (WHERE "type" = 'purchase'),
      0
    )::INTEGER AS revenue
  FROM "Event"
  GROUP BY "campaignId"
)
UPDATE "Campaign" AS campaign
SET
  "clicksCount" = stats.clicks,
  "addToCartCount" = stats.add_to_carts,
  "ordersCount" = stats.purchases,
  "revenueCents" = stats.revenue,
  "updatedAt" = CURRENT_TIMESTAMP
FROM stats
WHERE campaign."id" = stats."campaignId";

-- Prisma connects directly with the database owner. Browser-facing Supabase
-- roles must not read or mutate attribution and session tables.
ALTER TABLE "Campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "Campaign" FROM anon, authenticated;
REVOKE ALL ON TABLE "Event" FROM anon, authenticated;
REVOKE ALL ON TABLE "Session" FROM anon, authenticated;

GRANT ALL ON TABLE "Campaign" TO service_role;
GRANT ALL ON TABLE "Event" TO service_role;
GRANT ALL ON TABLE "Session" TO service_role;

COMMIT;
