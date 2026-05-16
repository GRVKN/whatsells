import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log("shop/redact webhook received", {
      topic,
      shop,
      payload,
    });

    // This app stores shop-level campaign metrics and session state only.
    // If shop data retention is required, remove it here.
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("shop/redact webhook failed", error);
    return new Response("Webhook error", { status: 401 });
  }
}