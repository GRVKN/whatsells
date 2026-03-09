/*
  Warnings:

  - A unique constraint covering the columns `[shop,name]` on the table `Campaign` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Event" ADD COLUMN "ipHash" TEXT;
ALTER TABLE "Event" ADD COLUMN "lang" TEXT;
ALTER TABLE "Event" ADD COLUMN "referer" TEXT;

-- CreateIndex
CREATE INDEX "Campaign_shop_createdAt_idx" ON "Campaign"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "Campaign_shop_status_idx" ON "Campaign"("shop", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_shop_name_key" ON "Campaign"("shop", "name");
