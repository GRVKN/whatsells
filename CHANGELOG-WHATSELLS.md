# WHATSELLS v22 — AI Expert copilot

## v22 included

- One paid Expert entitlement at €99/month protects every AI route on the
  server after a live Shopify subscription check.
- The model router assigns short shop-data questions and daily wording to
  `gpt-5.6-luna`, product/market/campaign decisions to `gpt-5.6-terra`,
  weekly deep strategy to `gpt-5.6-sol` and visuals to `gpt-image-2`.
- Current market scans use an explicitly required OpenAI web-search tool and
  preserve cited sources; ordinary chat cannot silently claim live research.
- Shopify catalog sync supplies published products, descriptions, prices,
  inventory and images for up to 250 current products without exposing customer
  personal data to OpenAI. Products no longer published to the storefront are
  excluded from new recommendations while their historical campaigns remain.
- Structured-output validation and a second local normalization layer discard
  invented product IDs, unsupported channels, negative budgets and allocations
  above the merchant's saved ceiling.
- Expert remembers merchant goals, prior messages, market scans, campaign
  drafts, accepted/rejected decisions and weekly strategies per shop.
- Campaign packages contain product, channel, audience, hypothesis, copy,
  duration, stop conditions and a bounded test budget.
- A separate merchant confirmation creates only the WhatSells tracking
  campaign and real tracking URL. It never launches external ads or spends
  money.
- Flyer generation uses AI only for the background. WhatSells overlays the real
  Shopify product image, exact copy and a locally generated scan-safe QR code.
- Generated assets are stored in a private Supabase bucket, streamed through an
  authenticated paid route and deleted after 90 days.
- Per-shop monthly quotas and a concurrency-safe estimated-cost reservation
  stop abuse before an API call. Provider failures fall back to the deterministic
  operator where applicable and never bypass the cost guard.
- Shop-redaction webhooks remove conversations, goals, drafts, decisions,
  usage records and private generated files.
- Seven new protected PostgreSQL tables, catalog fields, RLS, least-privilege
  grants, integrity checks and private Storage setup complete the Supabase
  upgrade.
- Fifty-seven automated checks pass across attribution, plans, Expert rules,
  model routing, usage accounting, storage paths, catalog normalization and
  campaign safeguards.

## Included

- Correct cumulative campaign-result chart: campaign cost is deducted once.
- Database-side event aggregation without the previous 1,000/3,000 event cap.
- Race-safe purchase attribution through a partial unique order index.
- Genuine order-webhook failures now return HTTP 500 so Shopify retries them.
- Orders can still be attributed after a campaign has been paused.
- Shopify customer and shop redaction webhooks now remove stored data.
- IP pseudonyms use a keyed HMAC instead of an unsalted hash.
- A three-second server-side duplicate guard reduces repeated Add-to-Cart events.
- Prisma and Supabase schema hardening, indexes, RLS restrictions and counter resync.
- A read-only duplicate-order preflight query for production deployment.
- Missing lint, type-check, formatting and environment templates.

## Step 2 included

- Shopify store currency is loaded through Admin GraphQL and used throughout
  the dashboard, campaign details, forms, tables and charts.
- The fixed euro symbol has been removed from campaign costs and analytics.
- New `refunds/create` and `orders/cancelled` webhooks reconcile attributed
  orders.
- Partial refunds reduce net attributed revenue without deleting the original
  order value.
- Cancelled orders stay visible for traceability but no longer count as active
  orders or conversion.
- Repeated and concurrent refund deliveries are idempotent.
- If an older order cannot be read through the standard 60-day order scope, the
  signed refund payload is processed safely and each refund ID is recorded.
- Dashboard and campaign details show net revenue, refunds and cancellations.
- Attributed-order rows show original value, refunded value, net value, status
  and currency.
- Clickable information popovers explain formulas, examples and limitations for
  campaign result, ROI, ROAS, conversion, funnel metrics and campaign fields.
- Campaign result is explicitly not presented as final business profit because
  product, shipping, payment, tax and operating costs are not yet deducted.
- Eleven automated analytics, money and reconciliation tests pass.

## Step 3 included

- A short three-step onboarding opens once for a new browser and remains
  available through the dashboard setup-guide button.
- A safe example campaign demonstrates setup, distribution and results without
  writing demo rows to Supabase or using a campaign-plan slot.
- A live getting-started checklist follows real milestones: first campaign,
  prepared link or QR code, first click and first attributed order.
- The campaign form now validates names, destination URLs and costs inline
  before sending data to the API.
- Empty, initial-loading and recoverable error states explain what happened and
  offer the correct next action.
- The dashboard explains the full destination → campaign → measurement flow
  before the user creates anything.
- Responsive grids, scroll-safe tables and wrapping tracking links improve the
  dashboard and campaign-detail pages on smaller screens.
- Empty detail tables now explain how data will appear instead of showing rows
  of placeholder dashes.
- Five additional onboarding and campaign-form tests bring the automated suite
  to sixteen tests.

## Step 4 included

- Free, Basic and Pro now use one shared entitlement definition on the server
  and in the interface.
- Free includes 3 campaigns, tracking links and QR codes plus clicks, orders,
  net revenue and all-time conversion.
- Basic includes 20 campaigns plus campaign cost, campaign result, ROI, ROAS,
  time-range charts, rankings, order/refund/event details and CSV export.
- Pro includes unlimited campaigns plus the Add-to-Cart funnel, Pro diagnosis
  and ongoing campaign-cost changes.
- Paid-only values are removed from API responses for plans that are not
  entitled to use them; the restrictions are not merely hidden in the UI.
- Add-to-Cart events are now rejected server-side for Free and Basic.
- A cached, successfully verified Shopify plan snapshot avoids a Partner API
  request for every public cart event and is refreshed when it becomes stale.
- Existing Free campaigns keep their history after an upgrade. Basic can set a
  missing initial campaign cost once; later cost changes remain Pro-only.
- CSV export is Basic/Pro-only and neutralizes merchant text that spreadsheet
  applications could otherwise interpret as a formula.
- The dashboard includes a responsive feature comparison, correct next-plan
  buttons and plan-specific locked states.
- Downgrades do not delete campaign data. The active plan immediately controls
  visible analytics, event collection and new-campaign limits.
- The public app entry no longer contains Shopify template placeholder copy.
- Eight additional entitlement and export checks bring the automated suite to
  twenty-four tests.

## Step 5 included

- New campaigns select a real Shopify product through Shopify's native product
  picker instead of asking the merchant to type a destination URL.
- The backend reloads and verifies the selected product through Admin GraphQL;
  spoofed IDs, inactive products and products unavailable in the Online Store
  are rejected.
- A normalized `TrackedProduct` table groups many campaigns under one Shopify
  product without duplicating product records.
- Historical campaigns remain untouched and appear in an unassigned group
  until the merchant chooses the correct product.
- Existing campaigns can be assigned or moved to another product without
  losing clicks, orders, refunds, costs or revenue.
- Product cards combine all channel links, QR codes and results in one view.
- Meta Ads, Instagram, TikTok, Google Ads and E-mail are now first-class
  channels alongside tracking links, packaging, flyers, influencers, events
  and QR codes.
- Search plus channel and status filters work across product titles, campaign
  names and notes.
- Product summaries show clicks, orders, net revenue and conversion for every
  plan; Basic also shows campaign result, ROI and product ranking; Pro adds the
  Add-to-Cart total.
- The CSV export now includes the product title and Shopify product ID.
- Shopify product access is restricted to the required `read_products` scope.
- Eight additional product, channel, grouping and validation checks bring the
  automated suite to thirty-two tests.

## Expert included

- Expert is a genuine fourth Shopify billing tier instead of an alias for Pro.
- The default managed-pricing handle is `expert`; v22 shows the final planned
  price of €99/month.
- Expert inherits every Pro entitlement and adds a server-only daily operator.
- The Expert route checks the live Shopify subscription before it reads,
  creates or returns any Expert analysis.
- Product and campaign Opportunity Scores combine recent intent, conversion,
  measured efficiency, momentum, refunds and evidence quality.
- Today's action prioritizes a stop/rework, funnel fix, controlled scale,
  product opportunity, channel test or data-collection task.
- Every recommendation includes a confidence level, evidence, rationale and a
  concrete next step.
- Expert never changes an external campaign or spends budget automatically.
- A daily `ExpertSnapshot` keeps the operator stable and auditable.
- A bearer-protected `/api/expert/daily` endpoint can be called by cronjob.org.
  Every candidate shop is rechecked through Shopify before a snapshot is
  generated.
- Optional OpenAI Responses API wording uses aggregate metrics only, structured
  output and `store: false`. It cannot change scores or actions.
- If OpenAI is disabled, unconfigured or temporarily unavailable, Expert keeps
  working with the verified deterministic explanations.
- Shop and customer redaction invalidate or delete affected Expert snapshots.
- The Supabase migration removes obsolete `SECURITY DEFINER` RPCs and duplicate
  indexes from the old repair draft, hardens current and future public objects,
  adds nonnegative data checks and protects `ExpertSnapshot` with RLS plus
  least-privilege grants.
- Eleven additional Expert, entitlement, AI-fallback and cron checks bring the
  automated suite to forty-three tests.

## Production deployment order

1. Back up the Supabase database.
2. Run `prisma/preflight/attribution_duplicates.sql` read-only.
3. Run `prisma/preflight/expert_schema_health.sql` read-only. The first three
   result sets must be empty. The final result may list obsolete functions that
   the new migration will remove.
4. If either data-health preflight returns invalid rows, review them before
   continuing.
5. Create the €99/month Shopify managed-pricing Expert plan with the exact
   handle used by `SHOPIFY_EXPERT_PLAN_HANDLE`.
6. Configure the variables documented in `.env.example`. Keep
   `EXPERT_AI_ENABLED=false` until an OpenAI project key is set.
7. Run `npm run check`.
8. Run `npx prisma migrate deploy`.
9. Run `prisma/preflight/expert_asset_bucket.sql` once in the Supabase SQL
   editor to create the private flyer bucket.
10. Run `prisma/preflight/expert_v22_postflight.sql` read-only. Every boolean
    column must be true and every browser-privilege count must be zero.
11. Confirm that `ShopPlanState`, `TrackedProduct`, `ExpertSnapshot` and all
    `Expert*` tables remain inaccessible to Supabase browser roles.
12. Deploy the Shopify app configuration so refund/cancellation subscriptions
   and the new `read_products` scope are registered.
13. Re-open the development shop and approve the product-read permission if
   Shopify requests updated authorization.
14. Open the app once in each development shop so the verified plan snapshot
    is populated.
15. Test product selection, two channels under one product and one legacy
    campaign assignment.
16. Test Free, Basic, Pro and Expert billing boundaries, one Basic CSV export,
    one Pro
    Add-to-Cart event, one partial refund and one cancellation before enabling
    the update for every merchant.
17. Post to `/api/expert/daily` with the configured bearer secret and confirm
    that only the paid Expert development shop receives a daily snapshot.
18. Set an OpenAI project spend cap, then enable `EXPERT_AI_ENABLED=true` and
    `EXPERT_WEB_SEARCH_ENABLED=true` only after the preceding checks pass.

Do not upload or commit `prisma/dev.sqlite`; it can contain Shopify sessions and
access tokens.

## React Router security review

- `npm audit` still reports the July 2026 React Router advisory.
- The advisory explicitly affects only applications using unstable RSC APIs;
  WhatSells does not enable or use React Server Components.
- The patched React Router 8.3 line requires React 19, Vite 7 and Node 22.22+.
- Shopify's current `@shopify/shopify-app-react-router` package declares React
  Router 7 as its supported peer dependency. Forcing version 8 would leave the
  Shopify runtime outside its supported dependency range.
- Keep WhatSells on the latest compatible React Router 7 release until Shopify
  publishes compatible adapter support, then perform the major upgrade with a
  dedicated Shopify authentication, billing and webhook regression test.

## Brace-expansion security review

- The July 2026 `brace-expansion` denial-of-service advisory is reported through
  `minimatch` in React Router's filesystem route/build tooling.
- WhatSells does not pass request, merchant or campaign input into filesystem
  glob expansion.
- The advisory currently has no compatible patched release for the installed
  `minimatch` dependency branches. Forcing `brace-expansion` 5.0.8 across older
  major-version contracts is not a safe production fix.
- Update the affected routing/build dependency as soon as its maintainers
  publish a compatible patched chain, then rerun the complete build and route
  regression suite.

## GraphQL codegen security review

- The full development audit also reports current `lodash` advisories through
  Shopify's GraphQL code-generation toolchain.
- The affected packages are used by the development-only code generator; the
  WhatSells request runtime neither calls `_.template` with merchant input nor
  exposes codegen to HTTP requests.
- No compatible patched dependency chain is currently offered by the installed
  Shopify codegen preset. Do not force an incompatible transitive override;
  update the preset when Shopify publishes a compatible release and rerun
  generation, type checks and the production build.
