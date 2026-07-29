# WHATSELLS v22 activation

Do not paste an OpenAI API key into source code, Git, a ZIP archive or a browser
variable. Add it only to the server environment.

## Safe deployment order

1. Back up Supabase.
2. Run the two read-only preflight files:
   `prisma/preflight/attribution_duplicates.sql` and
   `prisma/preflight/expert_schema_health.sql`.
3. Configure the Shopify managed-pricing plan at $79/month with a 14-day free
   trial and the exact handle in `SHOPIFY_EXPERT_PLAN_HANDLE` (default:
   `expert`).
4. Keep `EXPERT_AI_ENABLED=false` and run:

   ```bash
   npm ci
   npm run check
   npx prisma migrate deploy
   ```

5. Run `prisma/preflight/expert_asset_bucket.sql` once in the Supabase SQL
   editor.
6. Run `prisma/preflight/expert_v22_postflight.sql`. All table/RLS checks must
   be true, browser privilege counts must be zero, and the bucket checks must
   be true.
7. Deploy the Shopify app configuration and approve the `read_products` scope
   in a development shop if requested.
8. Test the Free, Basic, Pro and Expert boundaries with a paid Expert
   development subscription.
9. Configure the server-only variables from `.env.example`, including:

   ```env
   EXPERT_AI_ENABLED=true
   EXPERT_WEB_SEARCH_ENABLED=true
   OPENAI_API_KEY=replace-in-the-host-only
   OPENAI_FAST_MODEL=gpt-5.6-luna
   OPENAI_EXPERT_MODEL=gpt-5.6-terra
   OPENAI_DEEP_MODEL=gpt-5.6-sol
   OPENAI_IMAGE_MODEL=gpt-image-2
   EXPERT_MONTHLY_COST_LIMIT_MICROS=6000000
   ```

10. Set a project-level OpenAI spend cap and alerts as the independent global
    safety net.
11. Post to `/api/expert/daily` with
    `Authorization: Bearer <EXPERT_CRON_SECRET>` and confirm that only a paid
    Expert shop receives work.

## Important boundaries

- The market scan uses public web sources. It does not see private Meta,
  TikTok or Google Ads accounts.
- WhatSells creates its own tracking campaign only after merchant
  confirmation. It never starts external advertising or spends budget.
- The image model creates only the flyer background. The real product image,
  text, tracking URL and QR code are composed deterministically by WhatSells.
- Generated assets expire after 90 days.
- `prisma/dev.sqlite` can contain Shopify sessions and must never be deployed,
  committed or shared.
