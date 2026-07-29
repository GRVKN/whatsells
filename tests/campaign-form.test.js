import test from "node:test";
import assert from "node:assert/strict";

import {
  hasCampaignDraftErrors,
  validateCampaignDraft,
} from "../app/campaign-form.js";

test("accepts a complete campaign draft", () => {
  const errors = validateCampaignDraft({
    name: "Spring flyer",
    shopifyProductId: "gid://shopify/Product/123",
    cost: "25,50",
  });

  assert.deepEqual(errors, {});
  assert.equal(hasCampaignDraftErrors(errors), false);
});

test("reports useful errors for invalid campaign fields", () => {
  const errors = validateCampaignDraft({
    name: " ",
    shopifyProductId: "",
    cost: "-4",
  });

  assert.equal(typeof errors.name, "string");
  assert.equal(typeof errors.product, "string");
  assert.equal(typeof errors.cost, "string");
  assert.equal(hasCampaignDraftErrors(errors), true);
});

test("allows an optional campaign cost", () => {
  const errors = validateCampaignDraft({
    name: "Packaging insert",
    shopifyProductId: "gid://shopify/Product/456",
    cost: "",
  });

  assert.deepEqual(errors, {});
});
