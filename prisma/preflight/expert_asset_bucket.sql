-- Run once in the Supabase SQL editor before enabling Expert flyer generation.
-- The bucket remains private. WhatSells streams authenticated PNG previews and
-- PDF downloads through its own paid Expert route, so no public storage policy
-- is required.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'whatsells-expert',
  'whatsells-expert',
  false,
  12582912,
  ARRAY['image/png', 'application/pdf']::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
