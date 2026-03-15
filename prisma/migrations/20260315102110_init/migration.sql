-- CreateEnum
CREATE TYPE "CampaignSourceType" AS ENUM ('qr', 'link', 'packaging', 'flyer', 'influencer', 'event');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('click', 'view', 'purchase');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" "CampaignSourceType" NOT NULL DEFAULT 'qr',
    "targetUrl" TEXT,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "clicksCount" INTEGER NOT NULL DEFAULT 0,
    "revenueCents" INTEGER NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "userAgent" TEXT,
    "referer" TEXT,
    "ipHash" TEXT,
    "lang" TEXT,
    "orderId" TEXT,
    "valueCents" INTEGER,
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_publicToken_key" ON "Campaign"("publicToken");

-- CreateIndex
CREATE INDEX "Campaign_shop_createdAt_idx" ON "Campaign"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "Campaign_shop_status_idx" ON "Campaign"("shop", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_shop_name_key" ON "Campaign"("shop", "name");

-- CreateIndex
CREATE INDEX "Event_campaignId_createdAt_idx" ON "Event"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "Event_type_createdAt_idx" ON "Event"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
