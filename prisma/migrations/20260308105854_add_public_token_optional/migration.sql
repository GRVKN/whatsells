/*
  Warnings:

  - You are about to drop the column `profitCents` on the `Campaign` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Event" ADD COLUMN "currency" TEXT;
ALTER TABLE "Event" ADD COLUMN "orderId" TEXT;
ALTER TABLE "Event" ADD COLUMN "valueCents" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "publicToken" TEXT,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'qr',
    "targetUrl" TEXT,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "revenueCents" INTEGER NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Campaign" ("costCents", "createdAt", "id", "name", "notes", "ordersCount", "revenueCents", "shop", "sourceType", "status", "targetUrl", "updatedAt") SELECT "costCents", "createdAt", "id", "name", "notes", "ordersCount", "revenueCents", "shop", "sourceType", "status", "targetUrl", "updatedAt" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
CREATE UNIQUE INDEX "Campaign_publicToken_key" ON "Campaign"("publicToken");
CREATE INDEX "Campaign_shop_createdAt_idx" ON "Campaign"("shop", "createdAt");
CREATE INDEX "Campaign_shop_status_idx" ON "Campaign"("shop", "status");
CREATE UNIQUE INDEX "Campaign_shop_name_key" ON "Campaign"("shop", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
