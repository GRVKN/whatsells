import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTrackedProductUpsert,
  isShopifyProductGid,
  loadVerifiedShopifyProduct,
} from "../app/shopify-product.server.js";

function mockAdmin(product, errors = null) {
  return {
    graphql: async () => ({
      json: async () => ({
        data: { product },
        ...(errors ? { errors } : {}),
      }),
    }),
  };
}

test("accepts only Shopify product GIDs", () => {
  assert.equal(isShopifyProductGid("gid://shopify/Product/123"), true);
  assert.equal(isShopifyProductGid("gid://shopify/Collection/123"), false);
  assert.equal(isShopifyProductGid("123"), false);
});

test("builds a shop-scoped tracked product upsert", () => {
  const upsert = buildTrackedProductUpsert({
    shop: "example.myshopify.com",
    product: {
      shopifyProductId: "gid://shopify/Product/123",
      title: "Cooling vest",
      handle: "cooling-vest",
      status: "ACTIVE",
      onlineStoreUrl: "https://example.com/products/cooling-vest",
      imageUrl: "https://cdn.example/image.jpg",
      imageAlt: "Blue cooling vest",
    },
  });

  assert.deepEqual(upsert.where, {
    shop_shopifyProductId: {
      shop: "example.myshopify.com",
      shopifyProductId: "gid://shopify/Product/123",
    },
  });
  assert.equal(upsert.create.title, "Cooling vest");
  assert.equal(upsert.update.onlineStoreUrl, upsert.create.onlineStoreUrl);
});

test("loads an active Online Store product as a trusted snapshot", async () => {
  const result = await loadVerifiedShopifyProduct(
    mockAdmin({
      id: "gid://shopify/Product/123",
      title: "Cooling vest",
      handle: "cooling-vest",
      status: "ACTIVE",
      onlineStoreUrl: "https://example.com/products/cooling-vest",
      featuredMedia: {
        preview: {
          image: {
            url: "https://cdn.example/image.jpg",
            altText: "Cooling vest",
          },
        },
      },
    }),
    "gid://shopify/Product/123",
  );

  assert.equal(result.ok, true);
  assert.equal(result.product.title, "Cooling vest");
  assert.equal(
    result.product.onlineStoreUrl,
    "https://example.com/products/cooling-vest",
  );
});

test("rejects inactive or unpublished products", async () => {
  const draft = await loadVerifiedShopifyProduct(
    mockAdmin({
      id: "gid://shopify/Product/123",
      title: "Draft",
      handle: "draft",
      status: "DRAFT",
      onlineStoreUrl: null,
    }),
    "gid://shopify/Product/123",
  );

  const unpublished = await loadVerifiedShopifyProduct(
    mockAdmin({
      id: "gid://shopify/Product/456",
      title: "Hidden",
      handle: "hidden",
      status: "ACTIVE",
      onlineStoreUrl: null,
    }),
    "gid://shopify/Product/456",
  );

  assert.equal(draft.ok, false);
  assert.equal(draft.status, 422);
  assert.equal(unpublished.ok, false);
  assert.equal(unpublished.status, 422);
});
