import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log("customers/redact webhook received", {
      topic,
      shop,
      payload,
    });

    // This app does not retain customer PII. If any customer-specific data existed,
    // it should be removed here.
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("customers/redact webhook failed", error);
    return new Response("Webhook error", { status: 401 });
  }
}