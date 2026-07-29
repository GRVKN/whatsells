import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSetupChecklist,
  calculateSetupProgress,
} from "../app/getting-started.js";

test("starts with an empty onboarding checklist", () => {
  const checklist = buildSetupChecklist({
    campaignCount: 0,
    hasPreparedAsset: false,
    clicks: 0,
    orders: 0,
  });

  assert.equal(calculateSetupProgress(checklist), 0);
  assert.deepEqual(
    checklist.map((item) => item.complete),
    [false, false, false, false],
  );
});

test("calculates setup progress from real campaign milestones", () => {
  const checklist = buildSetupChecklist({
    campaignCount: 1,
    hasPreparedAsset: true,
    clicks: 14,
    orders: 0,
  });

  assert.equal(calculateSetupProgress(checklist), 75);
  assert.deepEqual(
    checklist.map((item) => item.complete),
    [true, true, true, false],
  );
});
