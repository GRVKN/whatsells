import { reconcileAttributedOrder } from "../order-reconciliation.server";
import { authenticate } from "../shopify.server";

const ALLOWED_TOPICS = new Set(["REFUNDS_CREATE", "ORDERS_CANCELLED"]);

function normalizeTopic(topic) {
  return String(topic || "")
    .trim()
    .toUpperCase()
    .replaceAll("/", "_");
}

export async function action({ request }) {
  let webhook;

  try {
    webhook = await authenticate.webhook(request);
  } catch (error) {
    console.error("Order reconciliation webhook authentication failed:", error);
    return new Response("Webhook authentication failed", { status: 401 });
  }

  const { admin, payload, shop, topic } = webhook;
  const normalizedTopic = normalizeTopic(topic);

  if (!ALLOWED_TOPICS.has(normalizedTopic)) {
    console.warn("Unexpected order reconciliation webhook acknowledged:", {
      shop,
      topic,
    });

    return new Response("Unexpected topic", { status: 200 });
  }

  try {
    const result = await reconcileAttributedOrder({
      admin,
      shop,
      payload,
      topic: normalizedTopic,
    });

    console.log("Order reconciliation webhook processed:", {
      shop,
      topic,
      ...result,
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Order reconciliation webhook failed:", {
      error,
      shop,
      topic,
    });

    return new Response("Webhook reconciliation failed", { status: 500 });
  }
}
