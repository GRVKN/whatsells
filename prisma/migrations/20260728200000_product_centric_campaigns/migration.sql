-- Group many campaigns under a verified Shopify product while preserving
-- every existing campaign. Historical rows intentionally remain unassigned
-- until the merchant selects the matching product in WhatSells.
ALTER TYPE "CampaignSourceType" ADD VALUE IF NOT EXISTS 'meta';
ALTER TYPE "CampaignSourceType" ADD VALUE IF NOT EXISTS 'instagram';
ALTER TYPE "CampaignSourceType" ADD VALUE IF NOT EXISTS 'tiktok';
ALTER TYPE "CampaignSourceType" ADD VALUE IF NOT EXISTS 'google';
ALTER TYPE "CampaignSourceType" ADD VALUE IF NOT EXISTS 'email';

BEGIN;

CREATE TABLE "TrackedProduct" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "shopifyProductId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "handle" TEXT NOT NULL,
  "status" TEXT,
  "onlineStoreUrl" TEXT NOT NULL,
  "imageUrl" TEXT,
  "imageAlt" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TrackedProduct_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Campaign"
  ADD COLUMN "productId" TEXT;

CREATE UNIQUE INDEX "TrackedProduct_shop_shopifyProductId_key"
  ON "TrackedProduct"("shop", "shopifyProductId");

CREATE INDEX "TrackedProduct_shop_title_idx"
  ON "TrackedProduct"("shop", "title");

CREATE INDEX "Campaign_shop_productId_idx"
  ON "Campaign"("shop", "productId");

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_productId_fkey"
  FOREIGN KEY ("productId")
  REFERENCES "TrackedProduct"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "TrackedProduct" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "TrackedProduct" FROM anon, authenticated;
GRANT ALL ON TABLE "TrackedProduct" TO service_role;

COMMIT;
