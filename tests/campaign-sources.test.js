import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMPAIGN_SOURCE_KEYS,
  getCampaignSourceLabel,
} from "../app/campaign-sources.js";

test("includes the online and offline channels used by WhatSells", () => {
  for (const channel of [
    "meta",
    "instagram",
    "tiktok",
    "google",
    "email",
    "packaging",
    "flyer",
    "influencer",
    "event",
  ]) {
    assert.equal(CAMPAIGN_SOURCE_KEYS.includes(channel), true);
  }
});

test("uses merchant-friendly channel labels", () => {
  assert.equal(getCampaignSourceLabel("meta"), "Meta Ads");
  assert.equal(getCampaignSourceLabel("google"), "Google Ads");
  assert.equal(getCampaignSourceLabel("tiktok"), "TikTok");
});
