import assert from "node:assert/strict";
import test from "node:test";

import { buildProductGroups, filterCampaigns } from "../app/product-groups.js";

const campaigns = [
  {
    id: "c1",
    name: "TikTok creator",
    sourceType: "influencer",
    status: "active",
    clicksCount: 100,
    ordersCount: 5,
    revenueCents: 20_000,
    costCents: 5_000,
    product: { id: "p1", title: "Cooling vest", handle: "cooling-vest" },
  },
  {
    id: "c2",
    name: "Packaging QR",
    sourceType: "packaging",
    status: "paused",
    clicksCount: 50,
    ordersCount: 2,
    revenueCents: 8_000,
    costCents: 1_000,
    product: { id: "p1", title: "Cooling vest", handle: "cooling-vest" },
  },
  {
    id: "legacy",
    name: "Old flyer",
    sourceType: "flyer",
    status: "active",
    clicksCount: 10,
    ordersCount: 0,
    revenueCents: 0,
    costCents: 500,
    product: null,
  },
];

test("groups multiple channels under the same Shopify product", () => {
  const groups = buildProductGroups(campaigns);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].product.title, "Cooling vest");
  assert.deepEqual(groups[0].channels, ["influencer", "packaging"]);
  assert.equal(groups[0].totals.clicksCount, 150);
  assert.equal(groups[0].totals.ordersCount, 7);
  assert.equal(groups[0].totals.revenueCents, 28_000);
  assert.equal(groups[0].totals.resultCents, 22_000);
  assert.equal(groups[0].rank, 1);
  assert.equal(groups[1].key, "unassigned");
  assert.equal(groups[1].rank, null);
});

test("filters across product, campaign, channel and status", () => {
  assert.equal(filterCampaigns(campaigns, { search: "cooling" }).length, 2);
  assert.equal(
    filterCampaigns(campaigns, { sourceType: "flyer" })[0].id,
    "legacy",
  );
  assert.equal(filterCampaigns(campaigns, { status: "paused" })[0].id, "c2");
});
