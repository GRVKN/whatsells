-- Run once in the Supabase SQL editor before enabling Expert flyer generation.
-- The bucket remains private. WhatSells streams authenticated files through its
-- own paid Expert route, so no public storage policy is required.
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
  ARRAY['image/webp', 'image/svg+xml']::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

