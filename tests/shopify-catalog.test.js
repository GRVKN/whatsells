import assert from "node:assert/strict";
import test from "node:test";

import { normalizeShopifyCatalogProducts } from "../app/shopify-catalog.server.js";

test("Expert catalog keeps active storefront facts and normalizes money", () => {
  const products = normalizeShopifyCatalogProducts(
    [
      {
        id: "gid://shopify/Product/1",
        title: "Test product",
        handle: "test-product",
        status: "ACTIVE",
        description: "A useful product",
        vendor: "WhatSells",
        productType: "Tools",
        tags: ["summer", "sale"],
        totalInventory: 7,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        onlineStoreUrl: "https://shop.example/products/test-product",
        priceRangeV2: {
          minVariantPrice: { amount: "19.99", currencyCode: "EUR" },
          maxVariantPrice: { amount: "29.99", currencyCode: "EUR" },
        },
        featuredMedia: {
          preview: {
            image: {
              url: "https://cdn.shopify.com/test.webp",
              altText: "Test",
            },
          },
        },
      },
    ],
    "EUR",
  );

  assert.equal(products.length, 1);
  assert.equal(products[0].minPriceCents, 1999);
  assert.equal(products[0].maxPriceCents, 2999);
  assert.equal(products[0].totalInventory, 7);
  assert.deepEqual(products[0].tags, ["summer", "sale"]);
});

test("Expert catalog excludes products without a storefront URL", () => {
  const products = normalizeShopifyCatalogProducts(
    [{ id: "gid://shopify/Product/2", title: "Draft" }],
    "EUR",
  );

  assert.deepEqual(products, []);
});
