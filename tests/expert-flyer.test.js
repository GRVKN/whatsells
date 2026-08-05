import assert from "node:assert/strict";
import test from "node:test";

import { renderExpertFlyerFiles } from "../app/expert-assets.server.js";
import {
  EXPERT_FLYER_FORMATS,
  buildExpertFlyerImagePrompt,
  buildExpertFlyerSvg,
  normalizeExpertFlyerInput,
} from "../app/expert-flyer.js";

const pixelPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=";

test("normalizes all supported flyer formats and editable copy", () => {
  for (const format of Object.values(EXPERT_FLYER_FORMATS)) {
    const flyer = normalizeExpertFlyerInput({
      values: {
        format: format.key,
        headline: "Sommer-Angebot",
        subline: "Nur für kurze Zeit",
        cta: "Jetzt entdecken",
        visualDirection: "Warm und hochwertig",
      },
      productTitle: "Produkt",
      language: "de",
    });

    assert.equal(flyer.format.key, format.key);
    assert.equal(flyer.headline, "Sommer-Angebot");
    assert.equal(flyer.measurementLabel, "Scannen. Besuchen. Messen.");
  }
});

test("image prompt treats the product photo as reference, not final artwork", () => {
  const flyer = normalizeExpertFlyerInput({
    values: { format: "a5", visualDirection: "Clean studio light" },
    productTitle: "Bottle",
  });
  const prompt = buildExpertFlyerImagePrompt({
    product: { title: "Bottle", productType: "Drinkware" },
    flyer,
    hasProductReference: true,
  });

  assert.match(prompt, /attached as visual reference/i);
  assert.match(prompt, /do not draw, copy or place the product itself/i);
  assert.match(prompt, /Do not draw a QR code/i);
});

test("renders a flyer to real PNG and PDF files", async () => {
  const flyer = normalizeExpertFlyerInput({
    values: {
      format: "instagram_post",
      headline: "Measure what sells",
      subline: "One product. One campaign. A clear result.",
      cta: "Scan now",
      visualDirection: "Emerald studio background",
    },
    productTitle: "Demo product",
  });
  const svg = buildExpertFlyerSvg({
    backgroundBase64: pixelPng,
    productImageDataUri: `data:image/png;base64,${pixelPng}`,
    productTitle: "Demo product",
    flyer,
    qrBase64: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    ).toString("base64"),
    trackingLink: "https://app.whatsells.dev/go/test",
  });
  const files = await renderExpertFlyerFiles(svg, flyer.format);

  assert.deepEqual(
    [...files.png.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  assert.equal(files.pdf.subarray(0, 4).toString("ascii"), "%PDF");
  assert.ok(files.png.length > 1_000);
  assert.ok(files.pdf.length > 1_000);
});
