-- Read-only production check.
-- Run this in Supabase before `prisma migrate deploy`.

SELECT
  "orderId",
  COUNT(*) AS duplicate_count,
  ARRAY_AGG("id" ORDER BY "createdAt") AS event_ids,
  ARRAY_AGG("campaignId" ORDER BY "createdAt") AS campaign_ids,
  ARRAY_AGG("valueCents" ORDER BY "createdAt") AS values_cents
FROM "Event"
WHERE "type" = 'purchase'
  AND "orderId" IS NOT NULL
GROUP BY "orderId"
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, "orderId";
