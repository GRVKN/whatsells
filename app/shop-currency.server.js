import { DEFAULT_CURRENCY, normalizeCurrencyCode } from "./money.js";

const SHOP_CURRENCY_QUERY = `#graphql
  query WhatSellsShopCurrency {
    shop {
      currencyCode
    }
  }
`;

export async function getShopCurrency(admin) {
  if (!admin?.graphql) {
    return DEFAULT_CURRENCY;
  }

  try {
    const response = await admin.graphql(SHOP_CURRENCY_QUERY);
    const body = await response.json();

    if (body?.errors?.length) {
      throw new Error(body.errors.map((error) => error.message).join("; "));
    }

    return normalizeCurrencyCode(body?.data?.shop?.currencyCode);
  } catch (error) {
    console.error("Could not load the Shopify store currency:", error);
    return DEFAULT_CURRENCY;
  }
}
