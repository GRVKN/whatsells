-- Read-only checks to run after `npx prisma migrate deploy`.
-- Every *_exists and *_rls_enabled value must be true.
-- Every anon_authenticated_privileges value must be zero.

WITH expected(table_name) AS (
  VALUES
    ('ExpertSnapshot'),
    ('ExpertGoal'),
    ('ExpertConversation'),
    ('ExpertMessage'),
    ('ExpertCampaignDraft'),
    ('ExpertGeneratedAsset'),
    ('ExpertUsage'),
    ('ExpertDecision')
)
SELECT
  expected.table_name,
  to_regclass(format('public.%I', expected.table_name)) IS NOT NULL
    AS table_exists,
  COALESCE(pg_class.relrowsecurity, false) AS rls_enabled
FROM expected
LEFT JOIN pg_class
  ON pg_class.oid = to_regclass(format('public.%I', expected.table_name))
ORDER BY expected.table_name;

SELECT
  grantee,
  COUNT(*) AS anon_authenticated_privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND table_name IN (
    'Session',
    'Campaign',
    'Event',
    'ShopPlanState',
    'TrackedProduct',
    'ExpertSnapshot',
    'ExpertGoal',
    'ExpertConversation',
    'ExpertMessage',
    'ExpertCampaignDraft',
    'ExpertGeneratedAsset',
    'ExpertUsage',
    'ExpertDecision'
  )
GROUP BY grantee
ORDER BY grantee;

SELECT
  COUNT(*) = 1 AS bucket_exists,
  COALESCE(BOOL_AND(public = false), false) AS private_bucket,
  COALESCE(BOOL_AND(file_size_limit = 12582912), false)
    AS size_limit_correct,
  COALESCE(
    BOOL_AND(
      allowed_mime_types @> ARRAY['image/png', 'application/pdf']::TEXT[]
    ),
    false
  ) AS mime_types_correct
FROM storage.buckets
WHERE id = 'whatsells-expert';
