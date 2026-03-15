import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log("Webhook received:", {
      topic,
      shop,
      payload,
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("customers/data_request webhook failed", error);
    return new Response("Webhook error", { status: 401 });
  }
}