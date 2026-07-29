-- Add the Pro funnel event and its cached campaign counter.
-- Kept in a separate migration so PostgreSQL commits the enum value before
-- later migrations use it in data repair queries.

ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'add_to_cart';

ALTER TABLE "Campaign"
ADD COLUMN IF NOT EXISTS "addToCartCount" INTEGER NOT NULL DEFAULT 0;
