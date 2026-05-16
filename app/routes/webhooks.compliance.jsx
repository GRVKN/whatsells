import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log("Compliance webhook received", {
      topic,
      shop,
      payload,
    });

    // This compliance route acknowledges Shopify compliance events.
    // No additional customer PII is retained by this app beyond campaign attribution metrics.
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Compliance webhook failed", error);
    return new Response("Unauthorized", { status: 401 });
  }
}