-- Cache the last successfully verified Shopify plan so the public tracker can
-- enforce Pro-only events without calling the Partner API for every cart click.
BEGIN;

CREATE TABLE "ShopPlanState" (
  "shop" TEXT NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'free',
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSuccessfulCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ShopPlanState_pkey" PRIMARY KEY ("shop"),
  CONSTRAINT "ShopPlanState_plan_check"
    CHECK ("plan" IN ('free', 'basic', 'pro'))
);

CREATE INDEX "ShopPlanState_checkedAt_idx"
  ON "ShopPlanState"("checkedAt");

ALTER TABLE "ShopPlanState" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "ShopPlanState" FROM anon, authenticated;
GRANT ALL ON TABLE "ShopPlanState" TO service_role;

COMMIT;
