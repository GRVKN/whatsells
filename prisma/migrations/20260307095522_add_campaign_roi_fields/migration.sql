-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'qr',
    "targetUrl" TEXT,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "revenueCents" INTEGER NOT NULL DEFAULT 0,
    "profitCents" INTEGER,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Campaign" ("costCents", "createdAt", "id", "name", "notes", "shop", "sourceType", "status", "targetUrl", "updatedAt") SELECT "costCents", "createdAt", "id", "name", "notes", "shop", "sourceType", "status", "targetUrl", "updatedAt" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
CREATE INDEX "Campaign_shop_createdAt_idx" ON "Campaign"("shop", "createdAt");
CREATE INDEX "Campaign_shop_status_idx" ON "Campaign"("shop", "status");
CREATE UNIQUE INDEX "Campaign_shop_name_key" ON "Campaign"("shop", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
