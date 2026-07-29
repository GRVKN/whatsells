import assert from "node:assert/strict";
import test from "node:test";

import {
  getBearerToken,
  isValidExpertCronRequest,
} from "../app/expert-cron.server.js";

test("daily Expert generation requires the exact bearer secret", () => {
  const request = new Request("https://app.example/api/expert/daily", {
    method: "POST",
    headers: {
      Authorization: "Bearer a-long-random-secret",
    },
  });

  assert.equal(getBearerToken(request), "a-long-random-secret");
  assert.equal(isValidExpertCronRequest(request, "a-long-random-secret"), true);
  assert.equal(isValidExpertCronRequest(request, "wrong-secret"), false);
});

test("daily Expert generation fails closed when the secret is missing", () => {
  const request = new Request("https://app.example/api/expert/daily", {
    method: "POST",
  });

  assert.equal(isValidExpertCronRequest(request, ""), false);
  assert.equal(isValidExpertCronRequest(request, "configured-secret"), false);
});
