function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function buildCumulativeCampaignResultRows(
  eventBuckets,
  campaignCostCents,
) {
  let cumulativeRevenueCents = 0;

  return eventBuckets.map((row) => {
    cumulativeRevenueCents += numberOrZero(row.revenueCents);

    return {
      ...row,
      // The total campaign cost is deducted once from cumulative revenue.
      profitCents: cumulativeRevenueCents - numberOrZero(campaignCostCents),
    };
  });
}
