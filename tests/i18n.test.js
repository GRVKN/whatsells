import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLanguagePreferenceCookie,
  normalizeLocale,
  normalizeLanguagePreference,
  resolveRequestLocalization,
  translate,
} from "../app/i18n.js";

test("normalizes supported locales and falls back to English", () => {
  assert.equal(normalizeLocale("de-DE"), "de");
  assert.equal(normalizeLocale("en_GB"), "en");
  assert.equal(normalizeLocale("fr-FR"), "en");
  assert.equal(normalizeLanguagePreference("de"), "de");
  assert.equal(normalizeLanguagePreference("unsupported"), "auto");
});

test("resolves Shopify locale and persists the detected language", () => {
  const request = new Request(
    "https://app.whatsells.dev/app?shop=test.myshopify.com&locale=de-DE",
  );
  const result = resolveRequestLocalization(request);

  assert.equal(result.locale, "de");
  assert.equal(result.preference, "auto");
  assert.equal(result.detectedLocale, "de");
  assert.match(
    result.headers.get("set-cookie"),
    /ws_detected_locale=de; Path=\/; SameSite=Lax/,
  );
});

test("manual language preference overrides the Shopify locale", () => {
  const request = new Request("https://app.whatsells.dev/app?locale=de-DE", {
    headers: {
      cookie: "ws_language=en; ws_detected_locale=de",
    },
  });
  const result = resolveRequestLocalization(request);

  assert.equal(result.locale, "en");
  assert.equal(result.preference, "en");
  assert.equal(result.detectedLocale, "de");
});

test("detected locale survives requests without the Shopify locale parameter", () => {
  const request = new Request("https://app.whatsells.dev/app/expert", {
    headers: {
      cookie: "ws_detected_locale=de",
    },
  });
  const result = resolveRequestLocalization(request);

  assert.equal(result.locale, "de");
  assert.equal(result.detectedLocale, "de");
});

test("automatic preference clears the manual cookie", () => {
  const request = new Request("https://app.whatsells.dev/app/settings");
  const cookie = buildLanguagePreferenceCookie(request, "auto");

  assert.match(cookie, /^ws_language=;/);
  assert.match(cookie, /Max-Age=0/);
});

test("translates strings with interpolation and falls back safely", () => {
  assert.equal(translate("de", "Settings"), "Einstellungen");
  assert.equal(translate("de", "Log in"), "Anmelden");
  assert.equal(
    translate(
      "de",
      "Track campaign links and QR codes, connect them to Shopify orders and see what actually sells.",
    ),
    "Verfolge Kampagnen-Links und QR-Codes, ordne sie Shopify-Bestellungen zu und erkenne, was sich wirklich verkauft.",
  );
  assert.equal(
    translate("de", "Current Shopify language: {language}", {
      language: "Deutsch",
    }),
    "Aktuelle Shopify-Sprache: Deutsch",
  );
  assert.equal(translate("de", "Unmapped source"), "Unmapped source");
  assert.equal(translate("en", "Settings"), "Settings");
});
