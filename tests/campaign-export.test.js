import assert from "node:assert/strict";
import test from "node:test";

import { buildCampaignExportCsv } from "../app/campaign-export.js";

test("campaign export contains profitability and tracking fields", () => {
  const csv = buildCampaignExportCsv(
    [
      {
        name: 'Summer flyer, "Berlin"',
        sourceType: "flyer",
        status: "active",
        targetUrl: "https://example.com/products/chair",
        createdAt: new Date("2026-07-28T10:00:00.000Z"),
        publicToken: "token-1",
        clicksCount: 100,
        ordersCount: 5,
        cancelledOrdersCount: 1,
        revenueCents: 20_000,
        refundedCents: 2_000,
        costCents: 5_000,
        notes: "Printed locally",
        product: {
          title: "Garden chair",
          shopifyProductId: "gid://shopify/Product/123",
        },
      },
    ],
    {
      currency: "EUR",
      trackBaseUrl: "https://app.whatsells.dev/",
    },
  );

  assert.match(csv, /Campaign result \(EUR\)/);
  assert.match(csv, /Garden chair/);
  assert.match(csv, /150\.00/);
  assert.match(csv, /300\.00/);
  assert.match(csv, /https:\/\/app\.whatsells\.dev\/go\/token-1/);
  assert.match(csv, /"Summer flyer, ""Berlin"""/);
});

test("campaign export neutralizes spreadsheet formulas from merchant text", () => {
  const csv = buildCampaignExportCsv([
    {
      name: '=HYPERLINK("https://example.test")',
      sourceType: "link",
      status: "active",
      notes: "@SUM(1+1)",
      revenueCents: 0,
      costCents: 5_000,
    },
  ]);

  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /'@SUM/);
  assert.match(csv, /-50\.00/);
});
