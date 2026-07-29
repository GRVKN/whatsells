import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  await db.$transaction([
    db.expertSnapshot.deleteMany({ where: { shop } }),
    db.shopPlanState.deleteMany({ where: { shop } }),
    ...(session ? [db.session.deleteMany({ where: { shop } })] : []),
  ]);

  return new Response();
};
