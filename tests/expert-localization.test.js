import assert from "node:assert/strict";
import test from "node:test";

import { localizeExpertRecommendation } from "../app/expert-localization.js";
import { translate } from "../app/i18n.js";

test("localizes deterministic Expert copy without changing merchant labels", () => {
  const localized = localizeExpertRecommendation(
    {
      title: "Collect a clearer signal for “Sommer-Aktion”",
      summary:
        "There is not enough recent tracked traffic for a reliable performance decision.",
      rationale:
        "Small samples can make one order or one refund look more important than it is.",
      nextStep:
        "Keep the campaign measurable, verify that the tracking link or QR code is actually distributed, and reassess after at least 30 tracked clicks.",
    },
    (source, variables) => translate("de", source, variables),
  );

  assert.equal(
    localized.title,
    "Sammle ein klareres Signal für „Sommer-Aktion“",
  );
  assert.match(localized.summary, /nicht genügend/);
  assert.match(localized.nextStep, /30 erfassten Klicks/);
});

test("keeps AI-generated or merchant-authored text unchanged when no key exists", () => {
  const localized = localizeExpertRecommendation(
    {
      title: "Eigene Empfehlung für Produkt X",
      summary: "Dieser Text wurde bereits auf Deutsch erzeugt.",
      rationale: "Messbare Daten fehlen noch.",
      nextStep: "Weitere Daten sammeln.",
    },
    (source, variables) => translate("de", source, variables),
  );

  assert.equal(localized.title, "Eigene Empfehlung für Produkt X");
  assert.equal(
    localized.summary,
    "Dieser Text wurde bereits auf Deutsch erzeugt.",
  );
});
