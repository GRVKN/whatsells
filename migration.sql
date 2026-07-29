-- WhatSells Expert v22: merchant goals, private AI conversations, campaign
-- drafts, generated-asset metadata and server-side usage accounting.
BEGIN;

ALTER TABLE "TrackedProduct"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "vendor" TEXT,
  ADD COLUMN "productType" TEXT,
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "minPriceCents" INTEGER,
  ADD COLUMN "maxPriceCents" INTEGER,
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "totalInventory" INTEGER,
  ADD COLUMN "shopifyCreatedAt" TIMESTAMP(3),
  ADD COLUMN "shopifyUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "catalogSyncedAt" TIMESTAMP(3);

ALTER TABLE "ExpertSnapshot"
  DROP CONSTRAINT IF EXISTS "ExpertSnapshot_aiStatus_check";

ALTER TABLE "ExpertSnapshot"
  ADD CONSTRAINT "ExpertSnapshot_aiStatus_check"
  CHECK ("aiStatus" IN ('rules_only', 'enhanced', 'failed', 'limited'));

CREATE TABLE "ExpertGoal" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "primaryGoal" TEXT NOT NULL DEFAULT 'profitable_sales',
  "monthlyAdBudgetCents" INTEGER NOT NULL DEFAULT 0,
  "targetRevenueCents" INTEGER,
  "targetRoas" DOUBLE PRECISION,
  "countryCode" TEXT NOT NULL DEFAULT 'DE',
  "language" TEXT NOT NULL DEFAULT 'de',
  "audience" TEXT,
  "brandVoice" TEXT,
  "differentiators" TEXT,
  "offerNotes" TEXT,
  "preferredChannels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "excludedChannels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "catalogSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpertGoal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpertGoal_primaryGoal_check"
    CHECK ("primaryGoal" IN (
      'profitable_sales',
      'revenue_growth',
      'product_launch',
      'clear_inventory',
      'brand_awareness'
    )),
  CONSTRAINT "ExpertGoal_monthlyAdBudgetCents_nonnegative"
    CHECK ("monthlyAdBudgetCents" >= 0),
  CONSTRAINT "ExpertGoal_targetRevenueCents_nonnegative"
    CHECK ("targetRevenueCents" IS NULL OR "targetRevenueCents" >= 0),
  CONSTRAINT "ExpertGoal_targetRoas_positive"
    CHECK ("targetRoas" IS NULL OR "targetRoas" > 0),
  CONSTRAINT "ExpertGoal_countryCode_check"
    CHECK ("countryCode" ~ '^[A-Z]{2}$'),
  CONSTRAINT "ExpertGoal_language_check"
    CHECK ("language" ~ '^[a-z]{2}(-[A-Z]{2})?$')
);

CREATE UNIQUE INDEX "ExpertGoal_shop_key"
  ON "ExpertGoal"("shop");

CREATE TABLE "ExpertConversation" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'WhatSells Expert',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpertConversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExpertConversation_shop_updatedAt_idx"
  ON "ExpertConversation"("shop", "updatedAt");

CREATE TABLE "ExpertMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'chat',
  "content" TEXT NOT NULL,
  "structured" JSONB,
  "citations" JSONB,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExpertMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpertMessage_role_check"
    CHECK ("role" IN ('merchant', 'assistant')),
  CONSTRAINT "ExpertMessage_kind_check"
    CHECK ("kind" IN (
      'chat',
      'market_analysis',
      'campaign_package',
      'weekly_strategy',
      'system_notice'
    ))
);

CREATE INDEX "ExpertMessage_shop_createdAt_idx"
  ON "ExpertMessage"("shop", "createdAt");
CREATE INDEX "ExpertMessage_conversationId_createdAt_idx"
  ON "ExpertMessage"("conversationId", "createdAt");

CREATE TABLE "ExpertCampaignDraft" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "conversationId" TEXT,
  "productId" TEXT,
  "campaignId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "channel" TEXT NOT NULL,
  "package" JSONB NOT NULL,
  "model" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpertCampaignDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpertCampaignDraft_status_check"
    CHECK ("status" IN ('draft', 'approved', 'rejected', 'archived')),
  CONSTRAINT "ExpertCampaignDraft_channel_check"
    CHECK ("channel" IN (
      'meta',
      'instagram',
      'tiktok',
      'google',
      'email',
      'influencer',
      'flyer',
      'packaging',
      'event',
      'qr',
      'link'
    ))
);

CREATE UNIQUE INDEX "ExpertCampaignDraft_campaignId_key"
  ON "ExpertCampaignDraft"("campaignId");
CREATE INDEX "ExpertCampaignDraft_shop_createdAt_idx"
  ON "ExpertCampaignDraft"("shop", "createdAt");
CREATE INDEX "ExpertCampaignDraft_shop_status_updatedAt_idx"
  ON "ExpertCampaignDraft"("shop", "status", "updatedAt");

CREATE TABLE "ExpertGeneratedAsset" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "draftId" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'generating',
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "storagePath" TEXT,
  "sourceStoragePath" TEXT,
  "prompt" TEXT,
  "model" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpertGeneratedAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpertGeneratedAsset_type_check"
    CHECK ("type" IN ('flyer', 'ad_visual')),
  CONSTRAINT "ExpertGeneratedAsset_status_check"
    CHECK ("status" IN ('generating', 'ready', 'failed')),
  CONSTRAINT "ExpertGeneratedAsset_dimensions_positive"
    CHECK (
      ("width" IS NULL OR "width" > 0) AND
      ("height" IS NULL OR "height" > 0)
    )
);

CREATE INDEX "ExpertGeneratedAsset_shop_createdAt_idx"
  ON "ExpertGeneratedAsset"("shop", "createdAt");
CREATE INDEX "ExpertGeneratedAsset_expiresAt_idx"
  ON "ExpertGeneratedAsset"("expiresAt");

CREATE TABLE "ExpertUsage" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'reserved',
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "webSearchCalls" INTEGER NOT NULL DEFAULT 0,
  "imageCount" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostMicros" INTEGER NOT NULL DEFAULT 0,
  "reservedCostMicros" INTEGER NOT NULL DEFAULT 0,
  "providerResponseId" TEXT,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpertUsage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpertUsage_category_check"
    CHECK ("category" IN (
      'daily_analysis',
      'chat',
      'market_analysis',
      'campaign_package',
      'weekly_strategy',
      'image'
    )),
  CONSTRAINT "ExpertUsage_status_check"
    CHECK ("status" IN ('reserved', 'succeeded', 'failed')),
  CONSTRAINT "ExpertUsage_counts_nonnegative"
    CHECK (
      "inputTokens" >= 0 AND
      "cachedInputTokens" >= 0 AND
      "outputTokens" >= 0 AND
      "webSearchCalls" >= 0 AND
      "imageCount" >= 0 AND
      "estimatedCostMicros" >= 0 AND
      "reservedCostMicros" >= 0
    )
);

CREATE UNIQUE INDEX "ExpertUsage_requestId_key"
  ON "ExpertUsage"("requestId");
CREATE INDEX "ExpertUsage_shop_createdAt_idx"
  ON "ExpertUsage"("shop", "createdAt");
CREATE INDEX "ExpertUsage_shop_category_createdAt_idx"
  ON "ExpertUsage"("shop", "category", "createdAt");

CREATE TABLE "ExpertDecision" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "draftId" TEXT,
  "decision" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExpertDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpertDecision_decision_check"
    CHECK ("decision" IN ('accepted', 'rejected', 'deferred'))
);

CREATE INDEX "ExpertDecision_shop_createdAt_idx"
  ON "ExpertDecision"("shop", "createdAt");

ALTER TABLE "ExpertMessage"
  ADD CONSTRAINT "ExpertMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId")
  REFERENCES "ExpertConversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExpertCampaignDraft"
  ADD CONSTRAINT "ExpertCampaignDraft_conversationId_fkey"
  FOREIGN KEY ("conversationId")
  REFERENCES "ExpertConversation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ExpertCampaignDraft_productId_fkey"
  FOREIGN KEY ("productId")
  REFERENCES "TrackedProduct"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ExpertCampaignDraft_campaignId_fkey"
  FOREIGN KEY ("campaignId")
  REFERENCES "Campaign"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExpertGeneratedAsset"
  ADD CONSTRAINT "ExpertGeneratedAsset_draftId_fkey"
  FOREIGN KEY ("draftId")
  REFERENCES "ExpertCampaignDraft"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExpertDecision"
  ADD CONSTRAINT "ExpertDecision_draftId_fkey"
  FOREIGN KEY ("draftId")
  REFERENCES "ExpertCampaignDraft"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TrackedProduct"
  ADD CONSTRAINT "TrackedProduct_price_nonnegative"
    CHECK (
      ("minPriceCents" IS NULL OR "minPriceCents" >= 0) AND
      ("maxPriceCents" IS NULL OR "maxPriceCents" >= 0)
    ),
  ADD CONSTRAINT "TrackedProduct_inventory_nonnegative"
    CHECK ("totalInventory" IS NULL OR "totalInventory" >= 0),
  ADD CONSTRAINT "TrackedProduct_currency_check"
    CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$');

ALTER TABLE "ExpertGoal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpertConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpertMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpertCampaignDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpertGeneratedAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpertUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpertDecision" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "ExpertGoal" FROM anon, authenticated;
REVOKE ALL ON TABLE "ExpertConversation" FROM anon, authenticated;
REVOKE ALL ON TABLE "ExpertMessage" FROM anon, authenticated;
REVOKE ALL ON TABLE "ExpertCampaignDraft" FROM anon, authenticated;
REVOKE ALL ON TABLE "ExpertGeneratedAsset" FROM anon, authenticated;
REVOKE ALL ON TABLE "ExpertUsage" FROM anon, authenticated;
REVOKE ALL ON TABLE "ExpertDecision" FROM anon, authenticated;

GRANT ALL ON TABLE "ExpertGoal" TO service_role;
GRANT ALL ON TABLE "ExpertConversation" TO service_role;
GRANT ALL ON TABLE "ExpertMessage" TO service_role;
GRANT ALL ON TABLE "ExpertCampaignDraft" TO service_role;
GRANT ALL ON TABLE "ExpertGeneratedAsset" TO service_role;
GRANT ALL ON TABLE "ExpertUsage" TO service_role;
GRANT ALL ON TABLE "ExpertDecision" TO service_role;

COMMIT;
