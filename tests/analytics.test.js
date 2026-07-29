import test from "node:test";
import assert from "node:assert/strict";
import { buildCumulativeCampaignResultRows } from "../app/analytics.js";

test("campaign cost is deducted once across chart buckets", () => {
  const rows = buildCumulativeCampaignResultRows(
    [
      { date: "2026-07-01", revenueCents: 5_000 },
      { date: "2026-07-02", revenueCents: 3_000 },
      { date: "2026-07-03", revenueCents: 4_000 },
    ],
    10_000,
  );

  assert.deepEqual(
    rows.map((row) => row.profitCents),
    [-5_000, -2_000, 2_000],
  );
});

test("chart calculation does not mutate source buckets", () => {
  const source = [{ date: "2026-07-01", revenueCents: 2_500 }];

  const rows = buildCumulativeCampaignResultRows(source, 1_000);

  assert.equal(source[0].profitCents, undefined);
  assert.equal(rows[0].profitCents, 1_500);
});
