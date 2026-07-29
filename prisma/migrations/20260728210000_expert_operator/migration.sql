-- Add the paid Expert operator, remove obsolete public RPC surfaces from the
-- earlier repair draft and keep every WhatSells table private to the backend.
BEGIN;

ALTER TABLE "ShopPlanState"
  DROP CONSTRAINT IF EXISTS "ShopPlanState_plan_check";

ALTER TABLE "ShopPlanState"
  ADD CONSTRAINT "ShopPlanState_plan_check"
  CHECK ("plan" IN ('free', 'basic', 'pro', 'expert'));

CREATE TABLE "ExpertSnapshot" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "snapshotDate" DATE NOT NULL,
  "currency" TEXT NOT NULL,
  "inputFingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "analysis" JSONB NOT NULL,
  "aiStatus" TEXT NOT NULL DEFAULT 'rules_only',
  "aiModel" TEXT,
  "dataThrough" TIMESTAMP(3) NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpertSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpertSnapshot_status_check"
    CHECK ("status" IN ('ready', 'insufficient_data')),
  CONSTRAINT "ExpertSnapshot_aiStatus_check"
    CHECK ("aiStatus" IN ('rules_only', 'enhanced', 'failed')),
  CONSTRAINT "ExpertSnapshot_currency_check"
    CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX "ExpertSnapshot_shop_snapshotDate_key"
  ON "ExpertSnapshot"("shop", "snapshotDate");

CREATE INDEX "ExpertSnapshot_shop_generatedAt_idx"
  ON "ExpertSnapshot"("shop", "generatedAt");

CREATE INDEX "ShopPlanState_plan_lastSuccessfulCheckAt_idx"
  ON "ShopPlanState"("plan", "lastSuccessfulCheckAt");

CREATE INDEX "Campaign_shop_productId_status_idx"
  ON "Campaign"("shop", "productId", "status");

-- Cached counters and monetary values must never become negative. These checks
-- intentionally stop the migration if historical corruption needs review.
ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_costCents_nonnegative"
    CHECK ("costCents" >= 0),
  ADD CONSTRAINT "Campaign_clicksCount_nonnegative"
    CHECK ("clicksCount" >= 0),
  ADD CONSTRAINT "Campaign_addToCartCount_nonnegative"
    CHECK ("addToCartCount" >= 0),
  ADD CONSTRAINT "Campaign_revenueCents_nonnegative"
    CHECK ("revenueCents" >= 0),
  ADD CONSTRAINT "Campaign_ordersCount_nonnegative"
    CHECK ("ordersCount" >= 0);

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_originalValueCents_nonnegative"
    CHECK ("originalValueCents" IS NULL OR "originalValueCents" >= 0),
  ADD CONSTRAINT "Event_valueCents_nonnegative"
    CHECK ("valueCents" IS NULL OR "valueCents" >= 0);

-- The old standalone repair SQL prepared SECURITY DEFINER functions that the
-- Prisma backend does not use. Drop them even if that draft was executed.
DROP FUNCTION IF EXISTS public.record_click_event(TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.record_add_to_cart_event(TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.record_purchase_event(TEXT, TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.resync_campaign_stats();
DROP FUNCTION IF EXISTS public.apply_campaign_event_aggregates();

-- Remove duplicate snake_case indexes created by the old repair draft. The
-- canonical Prisma indexes remain in place.
DROP INDEX IF EXISTS public.campaign_publictoken_unique_idx;
DROP INDEX IF EXISTS public.campaign_shop_name_unique_idx;
DROP INDEX IF EXISTS public.campaign_shop_createdat_idx;
DROP INDEX IF EXISTS public.campaign_shop_status_idx;
DROP INDEX IF EXISTS public.campaign_status_idx;
DROP INDEX IF EXISTS public.event_campaign_createdat_idx;
DROP INDEX IF EXISTS public.event_type_createdat_idx;
DROP INDEX IF EXISTS public.event_campaign_type_createdat_idx;
DROP INDEX IF EXISTS public.event_orderid_idx;
DROP INDEX IF EXISTS public.event_purchase_order_unique_idx;
DROP INDEX IF EXISTS public.session_shop_idx;
DROP INDEX IF EXISTS public.session_expires_idx;
DROP INDEX IF EXISTS public.session_shop_online_idx;
DROP INDEX IF EXISTS public.session_shop_expires_idx;

-- Old explicit policies are unnecessary: Prisma uses a trusted direct
-- connection and service_role bypasses RLS. Browser roles have no grants.
DROP POLICY IF EXISTS "campaign_deny_all_anon" ON "Campaign";
DROP POLICY IF EXISTS "campaign_deny_all_authenticated" ON "Campaign";
DROP POLICY IF EXISTS "campaign_service_role_full" ON "Campaign";
DROP POLICY IF EXISTS "event_deny_all_anon" ON "Event";
DROP POLICY IF EXISTS "event_deny_all_authenticated" ON "Event";
DROP POLICY IF EXISTS "event_service_role_full" ON "Event";
DROP POLICY IF EXISTS "session_deny_all_anon" ON "Session";
DROP POLICY IF EXISTS "session_deny_all_authenticated" ON "Session";
DROP POLICY IF EXISTS "session_service_role_full" ON "Session";

ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShopPlanState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrackedProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpertSnapshot" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "Session" FROM anon, authenticated;
REVOKE ALL ON TABLE "Campaign" FROM anon, authenticated;
REVOKE ALL ON TABLE "Event" FROM anon, authenticated;
REVOKE ALL ON TABLE "ShopPlanState" FROM anon, authenticated;
REVOKE ALL ON TABLE "TrackedProduct" FROM anon, authenticated;
REVOKE ALL ON TABLE "ExpertSnapshot" FROM anon, authenticated;

GRANT ALL ON TABLE "Session" TO service_role;
GRANT ALL ON TABLE "Campaign" TO service_role;
GRANT ALL ON TABLE "Event" TO service_role;
GRANT ALL ON TABLE "ShopPlanState" TO service_role;
GRANT ALL ON TABLE "TrackedProduct" TO service_role;
GRANT ALL ON TABLE "ExpertSnapshot" TO service_role;

-- Supabase exposes objects in public through its Data API. Make future tables
-- and functions private by default; explicitly grant only when needed.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public
  FROM PUBLIC, anon, authenticated;

COMMIT;
