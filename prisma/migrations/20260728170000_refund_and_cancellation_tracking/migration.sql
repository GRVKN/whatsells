-- Preserve the original attributed order value and track later refunds or
-- cancellations without deleting the order-attribution audit trail.
BEGIN;

ALTER TABLE "Campaign"
  ADD COLUMN "refundedCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cancelledOrdersCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Event"
  ADD COLUMN "originalValueCents" INTEGER,
  ADD COLUMN "refundedCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isCancelled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "reconciledAt" TIMESTAMP(3),
  ADD COLUMN "processedRefundIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Event"
SET "originalValueCents" = "valueCents"
WHERE "type" = 'purchase'
  AND "originalValueCents" IS NULL;

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_refundedCents_nonnegative"
  CHECK ("refundedCents" >= 0),
  ADD CONSTRAINT "Campaign_cancelledOrdersCount_nonnegative"
  CHECK ("cancelledOrdersCount" >= 0);

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_refundedCents_nonnegative"
  CHECK ("refundedCents" >= 0);

CREATE INDEX "Event_campaignId_isCancelled_createdAt_idx"
  ON "Event"("campaignId", "isCancelled", "createdAt");

COMMIT;
