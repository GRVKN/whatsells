const PRODUCT_GID_PREFIX = "gid://shopify/Product/";

const PRODUCT_QUERY = `#graphql
  query WhatSellsSelectedProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      onlineStoreUrl
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
`;

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isShopifyProductGid(value) {
  const id = clean(value);
  return (
    id.startsWith(PRODUCT_GID_PREFIX) && id.length > PRODUCT_GID_PREFIX.length
  );
}

export async function loadVerifiedShopifyProduct(admin, productId) {
  const id = clean(productId);

  if (!isShopifyProductGid(id)) {
    return {
      ok: false,
      status: 400,
      error: "Select a valid Shopify product.",
    };
  }

  if (!admin?.graphql) {
    return {
      ok: false,
      status: 503,
      error: "Shopify product access is currently unavailable.",
    };
  }

  try {
    const response = await admin.graphql(PRODUCT_QUERY, {
      variables: { id },
    });
    const body = await response.json();

    if (body?.errors?.length) {
      throw new Error(body.errors.map((error) => error.message).join("; "));
    }

    const product = body?.data?.product;

    if (!product) {
      return {
        ok: false,
        status: 404,
        error: "The selected Shopify product no longer exists.",
      };
    }

    if (clean(product.status).toUpperCase() !== "ACTIVE") {
      return {
        ok: false,
        status: 422,
        error:
          "Activate this Shopify product before creating a tracking campaign.",
      };
    }

    const onlineStoreUrl = clean(product.onlineStoreUrl);

    if (!onlineStoreUrl) {
      return {
        ok: false,
        status: 422,
        error:
          "Publish this product to the Shopify Online Store before creating a tracking campaign.",
      };
    }

    const image = product?.featuredMedia?.preview?.image;

    return {
      ok: true,
      product: {
        shopifyProductId: clean(product.id),
        title: clean(product.title) || "Untitled product",
        handle: clean(product.handle),
        status: clean(product.status) || null,
        onlineStoreUrl,
        imageUrl: clean(image?.url) || null,
        imageAlt: clean(image?.altText) || null,
      },
    };
  } catch (error) {
    console.error("Could not verify selected Shopify product", {
      error,
      productId: id,
    });

    return {
      ok: false,
      status: 502,
      error:
        "WhatSells could not load that product from Shopify. Check the product permission and try again.",
    };
  }
}

export function buildTrackedProductUpsert({ shop, product }) {
  const snapshot = {
    title: product.title,
    handle: product.handle,
    status: product.status,
    onlineStoreUrl: product.onlineStoreUrl,
    imageUrl: product.imageUrl,
    imageAlt: product.imageAlt,
  };

  return {
    where: {
      shop_shopifyProductId: {
        shop,
        shopifyProductId: product.shopifyProductId,
      },
    },
    create: {
      shop,
      shopifyProductId: product.shopifyProductId,
      ...snapshot,
    },
    update: snapshot,
  };
}
