import db from "./db.server.js";
import { normalizeCurrencyCode } from "./money.js";

const CATALOG_CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_CATALOG_PRODUCTS = 250;

const PRODUCT_CATALOG_QUERY = `#graphql
  query WhatSellsExpertCatalog {
    products(
      first: 250
      query: "status:active"
      sortKey: UPDATED_AT
      reverse: true
    ) {
      pageInfo {
        hasNextPage
      }
      nodes {
        id
        title
        handle
        status
        description
        vendor
        productType
        tags
        totalInventory
        createdAt
        updatedAt
        onlineStoreUrl
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
        featuredMedia {
          preview {
            image {
              url
              altText
            }
          }
        }
      }
    }
  }
`;

function clean(value, maxLength = 5_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function moneyToCents(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? Math.round(number * 100)
    : null;
}

export function normalizeShopifyCatalogProducts(nodes, fallbackCurrency) {
  const currencyFallback = normalizeCurrencyCode(fallbackCurrency);

  return (Array.isArray(nodes) ? nodes : [])
    .slice(0, MAX_CATALOG_PRODUCTS)
    .map((product) => {
      const image = product?.featuredMedia?.preview?.image;
      const minPrice = product?.priceRangeV2?.minVariantPrice;
      const maxPrice = product?.priceRangeV2?.maxVariantPrice;
      const id = clean(product?.id, 200);
      const onlineStoreUrl = clean(product?.onlineStoreUrl, 2_000);

      if (!id || !onlineStoreUrl) return null;

      return {
        shopifyProductId: id,
        title: clean(product?.title, 300) || "Untitled product",
        handle: clean(product?.handle, 300),
        status: clean(product?.status, 40) || null,
        onlineStoreUrl,
        imageUrl: clean(image?.url, 2_000) || null,
        imageAlt: clean(image?.altText, 500) || null,
        description: clean(product?.description, 3_000) || null,
        vendor: clean(product?.vendor, 300) || null,
        productType: clean(product?.productType, 300) || null,
        tags: (Array.isArray(product?.tags) ? product.tags : [])
          .map((tag) => clean(tag, 120))
          .filter(Boolean)
          .slice(0, 30),
        minPriceCents: moneyToCents(minPrice?.amount),
        maxPriceCents: moneyToCents(maxPrice?.amount),
        currency: normalizeCurrencyCode(
          minPrice?.currencyCode || maxPrice?.currencyCode,
          currencyFallback,
        ),
        totalInventory: Number.isFinite(Number(product?.totalInventory))
          ? Math.max(Math.floor(Number(product.totalInventory)), 0)
          : null,
        shopifyCreatedAt: cleanDate(product?.createdAt),
        shopifyUpdatedAt: cleanDate(product?.updatedAt),
      };
    })
    .filter(Boolean);
}

async function fetchCatalog(admin, fallbackCurrency) {
  if (!admin?.graphql) {
    throw new Error("Shopify product access is unavailable.");
  }

  const response = await admin.graphql(PRODUCT_CATALOG_QUERY);
  const body = await response.json();

  if (body?.errors?.length) {
    throw new Error(body.errors.map((error) => error.message).join("; "));
  }

  const nodes = body?.data?.products?.nodes || [];

  return {
    products: normalizeShopifyCatalogProducts(nodes, fallbackCurrency),
    complete: !body?.data?.products?.pageInfo?.hasNextPage,
  };
}

function shouldUseCachedCatalog(goal, now) {
  const syncedAt = goal?.catalogSyncedAt
    ? new Date(goal.catalogSyncedAt).getTime()
    : Number.NaN;

  return (
    Number.isFinite(syncedAt) &&
    now.getTime() - syncedAt >= 0 &&
    now.getTime() - syncedAt < CATALOG_CACHE_MS
  );
}

export async function syncShopifyExpertCatalog({
  shop,
  admin,
  currency,
  force = false,
  now = new Date(),
  dbClient = db,
}) {
  const normalizedShop = String(shop || "").trim();
  if (!normalizedShop) {
    throw new Error("Shop is required to sync the Expert catalog.");
  }

  const goal = await dbClient.expertGoal.findUnique({
    where: { shop: normalizedShop },
    select: { catalogSyncedAt: true },
  });

  if (!force && shouldUseCachedCatalog(goal, now)) {
    return dbClient.trackedProduct.findMany({
      where: {
        shop: normalizedShop,
        status: "ACTIVE",
        onlineStoreUrl: { not: "" },
        catalogSyncedAt: { gte: goal.catalogSyncedAt },
      },
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
    });
  }

  let syncedProductIds = null;

  try {
    const catalog = await fetchCatalog(admin, currency);
    const products = catalog.products;
    syncedProductIds = products.map((product) => product.shopifyProductId);

    await dbClient.$transaction(async (tx) => {
      for (const product of products) {
        await tx.trackedProduct.upsert({
          where: {
            shop_shopifyProductId: {
              shop: normalizedShop,
              shopifyProductId: product.shopifyProductId,
            },
          },
          create: {
            shop: normalizedShop,
            ...product,
            catalogSyncedAt: now,
          },
          update: {
            ...product,
            catalogSyncedAt: now,
          },
        });
      }

      if (catalog.complete) {
        await tx.trackedProduct.updateMany({
          where: {
            shop: normalizedShop,
            shopifyProductId: {
              notIn: products.map((product) => product.shopifyProductId),
            },
          },
          data: {
            status: "UNAVAILABLE",
            catalogSyncedAt: now,
          },
        });
      }

      await tx.expertGoal.upsert({
        where: { shop: normalizedShop },
        create: {
          shop: normalizedShop,
          catalogSyncedAt: now,
        },
        update: {
          catalogSyncedAt: now,
        },
      });
    });
  } catch (error) {
    console.error("Could not refresh Shopify catalog for Expert", {
      shop: normalizedShop,
      error: error?.message || String(error),
    });
  }

  return dbClient.trackedProduct.findMany({
    where: {
      shop: normalizedShop,
      status: "ACTIVE",
      onlineStoreUrl: { not: "" },
      ...(syncedProductIds
        ? {
            shopifyProductId: {
              in: syncedProductIds,
            },
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
  });
}

export const EXPERT_CATALOG_LIMIT = MAX_CATALOG_PRODUCTS;
