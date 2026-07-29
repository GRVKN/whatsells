import assert from "node:assert/strict";
import test from "node:test";

import { buildExpertStoragePath } from "../app/expert-storage.server.js";

test("Expert storage path hides the shop domain and rejects path characters", () => {
  const path = buildExpertStoragePath({
    shop: "merchant.myshopify.com",
    assetId: "../asset-1",
    extension: "../SVG",
    suffix: "Flyer Background",
  });

  assert.doesNotMatch(path, /merchant|myshopify/);
  assert.match(path, /^[a-f0-9]{24}\/asset-1-flyerbackground\.[a-z0-9]+$/);
  assert.doesNotMatch(path, /\.\./);
});
